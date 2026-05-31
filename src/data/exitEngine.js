/**
 * exitEngine.js — Multi-X Exit Engine dengan partial take-profit bertingkat,
 * trailing stop, dan momentum-death exit.
 *
 * Mengganti model binary SL/TP lama (cap +90%) dengan sistem yang bisa capture
 * multi-X runner sambil protect profit dan minimize round-trip loss.
 */

import { getVelocity, getPeak } from './snapshotStore';

/**
 * Tier take-profit bertingkat (% dari entry):
 * - Tier 1 (1R atau +15%): ambil 30% posisi, move SL ke breakeven
 * - Tier 2 (2R atau +35%): ambil 30% lagi
 * - Tier 3 (3R atau +60%): ambil 20% lagi
 * - Moonbag (20% sisa): trail dengan drawdown 25% dari peak, target 5-50x
 *
 * Rationale: scale out secara bertahap untuk lock profit, tapi sisakan moonbag
 * untuk catch runner ekstrem. Tier disesuaikan dengan grade (A+ lebih agresif).
 */
function getTiers(grade, slPct, entry) {
  const rr = grade === 'A+' ? 3.0 : grade === 'A' ? 2.4 : 1.9;

  // Tier dalam % dari entry
  const tier1Pct = Math.max(slPct * 1.0, 15); // minimal 1R atau 15%
  const tier2Pct = Math.max(slPct * rr * 0.6, 35); // ~60% dari target RR
  const tier3Pct = Math.max(slPct * rr * 1.0, 60); // full RR target

  return [
    { name: 'T1', pct: tier1Pct, price: entry * (1 + tier1Pct / 100), size: 0.30, action: 'PARTIAL_EXIT' },
    { name: 'T2', pct: tier2Pct, price: entry * (1 + tier2Pct / 100), size: 0.30, action: 'PARTIAL_EXIT' },
    { name: 'T3', pct: tier3Pct, price: entry * (1 + tier3Pct / 100), size: 0.20, action: 'PARTIAL_EXIT' },
    { name: 'MOONBAG', pct: null, price: null, size: 0.20, action: 'TRAIL' } // sisa 20%
  ];
}

/**
 * Hitung trailing stop untuk moonbag: % drawdown dari peak price.
 * Grade A+ = trail ketat (18%), grade B = trail lebar (28%).
 */
function getTrailDrawdownPct(grade) {
  if (grade === 'A+') return 18;
  if (grade === 'A') return 22;
  return 28; // grade B
}

/**
 * Deteksi momentum death: velocity trend berbalik negatif setelah profit.
 * Gunakan data dari snapshotStore (max 12 snapshot ~72s history).
 */
function isMomentumDead(ca, currentPnlPct) {
  if (currentPnlPct < 5) return false; // belum profit cukup, jangan exit dulu

  const velocity = getVelocity(ca);
  if (!velocity || velocity.snapshots < 3) return false;

  // Momentum mati jika price trend + volume trend + txns trend semua negatif
  const priceDown = velocity.priceTrend < -0.3 && velocity.priceM5Delta < 0;
  const volumeDown = velocity.volume5mTrend < -0.2 && velocity.volume5mDelta < 0;
  const txnsDown = velocity.txnsTrend < -0.3 && velocity.txnsDelta < 0;

  // Butuh minimal 2 dari 3 indikator negatif
  const negativeCount = [priceDown, volumeDown, txnsDown].filter(Boolean).length;
  return negativeCount >= 2;
}

/**
 * Compute exit actions untuk satu trade.
 *
 * @param {object} trade - trade object dari autoTrader
 * @param {number} currentPrice - harga live saat ini
 * @param {object} liveToken - token snapshot terbaru (untuk velocity check)
 * @returns {object} { actions: [...], newStop, newStatus, reason }
 */
export function computeExitActions(trade, currentPrice, liveToken) {
  if (!trade || trade.status !== 'ACTIVE') {
    return { actions: [], newStop: trade?.sl, newStatus: trade?.status, reason: null };
  }

  const { ca, entry, sl, grade, slPct, positionRemaining = 1.0, tiers, peakPrice = entry, slMovedToBreakeven = false } = trade;

  if (!entry || !currentPrice || currentPrice <= 0) {
    return { actions: [], newStop: sl, newStatus: 'ACTIVE', reason: null };
  }

  const currentPnlPct = ((currentPrice - entry) / entry) * 100;
  const actions = [];
  let newStop = sl;
  let newStatus = 'ACTIVE';
  let reason = null;

  // 1. Hard SL hit
  if (currentPrice <= sl) {
    actions.push({ type: 'FULL_EXIT', price: currentPrice, size: positionRemaining, reason: 'SL hit' });
    newStatus = 'LOSS';
    reason = 'Stop loss tercapai';
    return { actions, newStop: sl, newStatus, reason };
  }

  // 2. Momentum death exit (setelah profit)
  if (isMomentumDead(ca, currentPnlPct)) {
    actions.push({ type: 'FULL_EXIT', price: currentPrice, size: positionRemaining, reason: 'Momentum mati' });
    newStatus = currentPnlPct > 0 ? 'WIN' : 'LOSS';
    reason = 'Momentum mati — velocity berbalik negatif';
    return { actions, newStop: sl, newStatus, reason };
  }

  // 3. Partial exits di tier bertingkat
  const activeTiers = tiers || getTiers(grade, slPct, entry);
  for (const tier of activeTiers) {
    if (tier.action !== 'PARTIAL_EXIT') continue;
    if (tier.hit) continue; // tier sudah di-hit sebelumnya

    if (currentPrice >= tier.price) {
      actions.push({ type: 'PARTIAL_EXIT', tier: tier.name, price: tier.price, size: tier.size, reason: `${tier.name} tercapai +${tier.pct.toFixed(1)}%` });
      tier.hit = true;

      // Move SL ke breakeven setelah tier pertama hit
      if (tier.name === 'T1' && !slMovedToBreakeven) {
        newStop = entry;
        actions.push({ type: 'MOVE_STOP', newStop: entry, reason: 'SL ke breakeven setelah T1' });
      }
    }
  }

  // 4. Trailing stop untuk moonbag (setelah semua tier partial hit)
  const allPartialsHit = activeTiers.filter(t => t.action === 'PARTIAL_EXIT').every(t => t.hit);
  if (allPartialsHit && positionRemaining > 0) {
    const peak = Math.max(peakPrice, currentPrice);
    const trailPct = getTrailDrawdownPct(grade);
    const trailStop = peak * (1 - trailPct / 100);

    if (trailStop > newStop) {
      newStop = trailStop;
      actions.push({ type: 'TRAIL_STOP', newStop: trailStop, peak, trailPct, reason: `Trail ${trailPct}% dari peak ${peak.toFixed(6)}` });
    }

    // Trailing stop hit
    if (currentPrice <= trailStop) {
      actions.push({ type: 'FULL_EXIT', price: currentPrice, size: positionRemaining, reason: 'Trailing stop hit' });
      newStatus = 'WIN';
      reason = `Trailing stop hit — exit di +${currentPnlPct.toFixed(1)}%`;
      return { actions, newStop: trailStop, newStatus, reason };
    }
  }

  return { actions, newStop, newStatus, reason };
}

/**
 * Apply exit actions ke trade object (pure function — return new trade).
 * Ini dipanggil dari autoTrader.applyPriceUpdates.
 */
export function applyExitActions(trade, actions, currentPrice) {
  let newTrade = { ...trade };
  let realizedPnl = trade.realizedPnl || 0;
  let positionRemaining = trade.positionRemaining ?? 1.0;
  const exitEvents = [...(trade.exitEvents || [])];

  for (const action of actions) {
    const timestamp = Date.now();

    if (action.type === 'PARTIAL_EXIT') {
      const exitSize = action.size;
      const exitPrice = action.price;
      const exitPnlPct = ((exitPrice - trade.entry) / trade.entry) * 100;
      const weightedPnl = exitPnlPct * exitSize;

      realizedPnl += weightedPnl;
      positionRemaining -= exitSize;

      exitEvents.push({
        type: 'PARTIAL_EXIT',
        tier: action.tier,
        price: exitPrice,
        size: exitSize,
        pnlPct: exitPnlPct,
        reason: action.reason,
        timestamp
      });
    } else if (action.type === 'FULL_EXIT') {
      const exitPrice = action.price;
      const exitPnlPct = ((exitPrice - trade.entry) / trade.entry) * 100;
      const weightedPnl = exitPnlPct * positionRemaining;

      realizedPnl += weightedPnl;

      exitEvents.push({
        type: 'FULL_EXIT',
        price: exitPrice,
        size: positionRemaining,
        pnlPct: exitPnlPct,
        reason: action.reason,
        timestamp
      });

      positionRemaining = 0;
      newTrade.closePrice = exitPrice;
      newTrade.closedAt = timestamp;
    } else if (action.type === 'MOVE_STOP') {
      newTrade.sl = action.newStop;
      newTrade.slMovedToBreakeven = true;
      exitEvents.push({
        type: 'MOVE_STOP',
        newStop: action.newStop,
        reason: action.reason,
        timestamp
      });
    } else if (action.type === 'TRAIL_STOP') {
      newTrade.sl = action.newStop;
      newTrade.peakPrice = action.peak;
      exitEvents.push({
        type: 'TRAIL_STOP',
        newStop: action.newStop,
        peak: action.peak,
        trailPct: action.trailPct,
        reason: action.reason,
        timestamp
      });
    }
  }

  // Blended PnL: realized + unrealized dari sisa posisi
  const unrealizedPnl = positionRemaining > 0 && currentPrice
    ? ((currentPrice - trade.entry) / trade.entry) * 100 * positionRemaining
    : 0;

  newTrade.realizedPnl = realizedPnl;
  newTrade.positionRemaining = positionRemaining;
  newTrade.pnlPct = realizedPnl + unrealizedPnl;
  newTrade.exitEvents = exitEvents;

  return newTrade;
}
