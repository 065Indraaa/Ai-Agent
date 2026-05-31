/**
 * signalNarrative.js — Penyusun narasi sinyal.
 *
 * PENTING: file ini TIDAK menghitung skor apa pun. Ia hanya MERANGKAI nilai
 * yang sudah dihasilkan engine analisa (apeEngine, rugDetector, runnerDetector)
 * menjadi objek terstruktur yang gampang dirender UI. Semua angka berasal dari
 * report/rug/runner/grade — murni labeling & penyusunan bahasa.
 */

function pct(value, digits = 1) {
  const num = Number(value || 0);
  return `${num > 0 ? '+' : ''}${num.toFixed(Math.abs(num) >= 100 ? 0 : digits)}%`;
}

function formatUsdFee(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  if (num < 1) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(0)}`;
}

/**
 * Sembunyikan nama backend/provider dari teks yang tampil di frontend, ganti
 * dengan istilah generik supaya UI tetap bersih & netral.
 */
const BRAND_REPLACEMENTS = [
  [/dexscreener/gi, 'feed pasar'],
  [/pumpportal/gi, 'stream live'],
  [/pump\.?fun/gi, 'launchpad'],
  [/pumpswap/gi, 'DEX'],
  [/raydium/gi, 'DEX'],
  [/\borca\b/gi, 'DEX'],
  [/meteora/gi, 'DEX'],
  [/moonshot/gi, 'DEX'],
  [/birdeye/gi, 'agregator'],
  [/jupiter/gi, 'registry'],
  [/bitquery/gi, 'indexer'],
  [/solscan(?:\s*pro)?/gi, 'indexer'],
  [/helius/gi, 'node'],
];

function cleanText(value) {
  if (!value || typeof value !== 'string') return value;
  return BRAND_REPLACEMENTS.reduce((str, [pattern, replacement]) => str.replace(pattern, replacement), value);
}

/* ─── Kenapa Entry ────────────────────────────────────────────────────────── */
function buildEntryRationale({ token, report, runner, grade, side, reasons, narrative = null }) {
  const flags = token.flags || {};
  const m5 = Number(token.priceChange?.m5 ?? token.m5 ?? 0);
  const h1 = Number(token.priceChange?.h1 ?? token.h1 ?? 0);
  const buys = Number(flags.buys5m || 0);
  const sells = Number(flags.sells5m || 0);
  const total = buys + sells;
  const buyRatio = total > 0 ? buys / total : 0.5;

  const points = [];

  if (side === 'BUY') {
    points.push(`Engine kasih grade ${grade} dengan skor ${report.score}/96 — masuk band "${report.verdict.label}".`);
  } else {
    points.push(`Grade ${grade}: ${report.verdict.label}. ${report.verdict.instruction}.`);
  }

  if (m5 !== 0 || h1 !== 0) {
    points.push(`Momentum harga: M5 ${pct(m5)}, H1 ${pct(h1)}.`);
  }
  if (total > 0) {
    points.push(`Tekanan order 5m: ${buys} buy / ${sells} sell (buy ratio ${(buyRatio * 100).toFixed(0)}%).`);
  }
  if (runner?.runnerScore > 0) {
    const tail = runner.signals?.length ? ` — ${runner.signals.slice(0, 3).join(', ')}` : '';
    points.push(`Runner score ${runner.runnerScore}/100${tail}.`);
  }
  if (report.volumeIntegrity != null) {
    points.push(`Integritas volume ${report.volumeIntegrity}% (keyakinan data live ${report.confidence}%).`);
  }

  // Tambahkan narrative signals
  if (narrative && narrative.signals && narrative.signals.length > 0) {
    narrative.signals.forEach(sig => points.push(`Narasi: ${sig}`));
  }

  (reasons || []).forEach((reason) => {
    const clean = cleanText(reason);
    if (clean && !points.includes(clean)) points.push(clean);
  });

  const headline = side === 'BUY'
    ? (grade === 'A+'
      ? 'Setup kuat — struktur, momentum, dan risiko selaras.'
      : 'Setup layak entry dengan risiko terkendali.')
    : grade === 'B'
      ? 'HIGH RISK — entry spekulatif. SL/TP dilebarkan otomatis, sizing kecil & disiplin.'
      : 'Tidak memenuhi kriteria entry — lebih baik dihindari.';

  return { headline, points };
}

/* ─── Rasional SL / TP ────────────────────────────────────────────────────── */
function buildSlTpRationale({ entry, sl, tp, tpPct, slPct, rr }) {
  const hasLevels = entry > 0 && sl != null && tp != null;
  const ratio = rr || (slPct > 0 ? tpPct / slPct : null);

  let text;
  if (!hasLevels) {
    text = 'Level entry belum bisa dihitung karena harga live belum tersedia dari provider.';
  } else {
    text = `SL & TP bersifat relatif — dihitung dari volatilitas, likuiditas, momentum, dan grade token ini (bukan persen tetap). `
      + `Take Profit ${pct(tpPct)} di atas entry, Stop Loss ${pct(-slPct)} di bawah entry`
      + (ratio ? `, risk:reward ≈ 1:${Number(ratio).toFixed(1)}. ` : '. ')
      + 'Saat harga live menyentuh salah satu level, trade backtest ditutup otomatis (WIN/LOSS) tanpa intervensi.';
  }

  return {
    tpPct: Number(tpPct || 0),
    slPct: Number(slPct || 0),
    rr: ratio ? Number(Number(ratio).toFixed(2)) : null,
    entry: entry || null,
    sl: sl || null,
    tp: tp || null,
    text
  };
}

/* ─── Global Fees & Integritas Volume ─────────────────────────────────────── */
function buildVolumeFees({ token, report }) {
  const flags = token.flags || {};
  const globalFees = flags.globalFees || null;
  const exact = Boolean(globalFees?.exact);
  const integrity = report.volumeIntegrity;
  const currentFeeUsd = globalFees?.currentUsd ?? globalFees?.windows?.m5 ?? null;

  const feeMode = exact ? 'data fee real dari indexer' : 'estimasi proxy (volume × 0.25%)';
  const integrityRead = integrity == null
    ? 'belum bisa dinilai'
    : integrity < 25
      ? 'rendah — indikasi wash trading / volume palsu'
      : integrity < 55
        ? 'sedang — ada keraguan pada keaslian volume'
        : 'sehat — volume relatif kredibel';

  const feeStr = formatUsdFee(currentFeeUsd);
  const text = `Integritas volume ${integrity ?? '—'}% (${integrityRead}). `
    + `Biaya/fee dibaca dari ${feeMode}${feeStr ? `, sekitar ${feeStr} pada window terakhir` : ''}. `
    + 'Prinsip Ponyin: volume besar wajib disertai jejak fee, likuiditas, dan jumlah transaksi yang masuk akal.';

  return {
    integrity,
    exact,
    feeMode,
    currentFeeUsd,
    feeLabel: feeStr,
    text
  };
}

/* ─── Narasi risiko ───────────────────────────────────────────────────────── */
function buildRiskNarrative({ report, rug }) {
  return {
    primaryRisk: report.primaryRisk,
    level: rug?.level || 'low',
    isRugged: Boolean(rug?.isRugged),
    isDead: Boolean(rug?.isDead),
    reasons: rug?.reasons || []
  };
}

/* ─── Insight holder ──────────────────────────────────────────────────────── */
function buildHolderInsight({ token }) {
  const flags = token.flags || {};
  const top10Pct = flags.top10Pct;
  const uniqueOwnerCount = flags.uniqueOwnerCount;
  const burners = Number(flags.burners || 0);
  const whales = Number(flags.whales || 0);
  const smartMoney = Number(flags.smartMoneyCount || 0);
  const kol = flags.kolDetected && typeof flags.kolDetected === 'object' ? flags.kolDetected : null;

  const parts = [];
  if (top10Pct != null) parts.push(`Top 10 holder memegang ${Number(top10Pct).toFixed(1)}% supply`);
  if (uniqueOwnerCount != null) parts.push(`${uniqueOwnerCount} owner unik`);
  if (whales > 0) parts.push(`${whales} whale (>250 SOL)`);
  if (smartMoney > 0) parts.push(`${smartMoney} smart/large wallet`);
  if (burners > 0) parts.push(`${burners} burner wallet`);
  if (kol?.name) parts.push(`KOL terdeteksi: ${kol.name}`);

  const text = parts.length
    ? `${parts.join(' · ')}.`
    : 'Data distribusi holder belum berhasil ditarik dari RPC/indexer.';

  return { top10Pct, uniqueOwnerCount, burners, whales, smartMoney, kol, text };
}

/* ─── Provider / sumber data ──────────────────────────────────────────────── */
function buildProviders({ token, report }) {
  const flags = token.flags || {};
  return {
    confidence: report.confidence,
    providerConfidence: token.providerConfidence || null,
    sources: token.source || token.provider || 'unknown',
    discrepancyPct: Number(flags.priceDiscrepancyPct || 0),
    discrepancySuspicious: Boolean(flags.priceDiscrepancySuspicious),
    jupiterRegistered: Boolean(flags.jupiterRegistered)
  };
}

/**
 * Susun seluruh narasi sinyal dari output engine.
 * @returns objek terstruktur untuk dikonsumsi SignalDetail.
 */
export function buildSignalExplain({ token, report, rug, runner, grade, side, reasons, entry, sl, tp, tpPct, slPct, rr, narrative = null }) {
  return {
    verdict: report.verdict,
    summary: cleanText(report.summary),
    score: report.score,
    confidence: report.confidence,
    volumeIntegrity: report.volumeIntegrity,

    entryRationale: buildEntryRationale({ token, report, runner, grade, side, reasons, narrative }),
    slTpRationale: buildSlTpRationale({ entry, sl, tp, tpPct, slPct, rr }),
    volumeFees: buildVolumeFees({ token, report }),
    riskNarrative: buildRiskNarrative({ report, rug }),
    holderInsight: buildHolderInsight({ token }),
    runnerSummary: {
      score: runner?.runnerScore || 0,
      isRunner: Boolean(runner?.isRunner),
      signals: runner?.signals || []
    },
    providers: buildProviders({ token, report }),
    narrative: narrative ? {
      themes: narrative.themes || [],
      isHotMeta: narrative.isHotMeta || false,
      isSaturated: narrative.isSaturated || false,
      isFirstMover: narrative.isFirstMover || false,
      narrativeScore: narrative.narrativeScore || 0,
      signals: narrative.signals || []
    } : null,

    // pass-through dari engine (nama backend disaring agar UI bersih)
    checks: (report.checks || []).map((c) => ({ ...c, detail: cleanText(c.detail) })),
    marketSignals: (report.marketSignals || []).map((m) => ({ ...m, detail: cleanText(m.detail) })),
    knowledgeHits: report.knowledgeHits || [],
    layers: report.layers || []
  };
}
