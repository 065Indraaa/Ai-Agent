import { analysisLayers, ponyinPrinciples } from './knowledgeBase';
import { getCachedBaseline } from './marketRegime';

export const emptyToken = {
  id: 'empty',
  phase: 'manual',
  name: 'Paste Contract Address',
  ticker: 'SCAN',
  ca: '',
  source: 'Nunggu API live',
  age: '-',
  ageMinutes: null,
  curve: 0,
  buySell: '-',
  devTx: null,
  sniperWallets: null,
  lpStatus: 'Belum di-scan',
  marketCap: '-',
  volume5m: '-',
  liquidityUsd: 0,
  flags: {
    mintRevoked: null,
    freezeActive: null,
    lpBurned: null,
    devSoldPct: null,
    top10Pct: null,
    commonFunderWallets: null,
    uniqueOwnerCount: null,
    firstMinuteHoldingPct: null,
    cabalSync: null,
    reportedVolume: 0,
    feeCollected: null,
    dexPaidTiming: 'none',
    activeBoosts: 0,
    pumpFromLowPct: 0,
    candleConfirmation: 0,
    volumeLiquidityRatio: 0,
    txns5m: 0,
    buys5m: 0,
    sells5m: 0,
    kolDetected: null,
    smartMoneyCount: 0,
    whales: 0,
    burners: 0
  },
  feedInsight: 'Masukin contract address buat ambil data DexScreener, Solana RPC, sama PumpPortal stream.'
};

export function analyzeToken(token = emptyToken, regimeBaseline = null) {
  const target = token || emptyToken;
  const baseline = regimeBaseline || getCachedBaseline();
  const flags = { ...emptyToken.flags, ...(target.flags || {}) };
  const feeHealth = computeFeeHealth(flags);
  const volumeIntegrity = computeVolumeIntegrity(flags, feeHealth, baseline);
  const confidence = computeConfidence(target, flags);

  let score = 58;

  score += scoreAuthority(flags);
  score += scoreHolders(flags, target.phase, baseline);
  score += scoreVolume(flags, volumeIntegrity, baseline);
  score += scoreMarketing(flags);
  score += scoreCandle(flags);
  score += scoreLiquidity(target, flags, baseline);
  score += scoreUnknowns(flags, target);
  score += scoreExternalSignals(flags);

  if (confidence < 42) score = Math.min(score, 61);
  if (confidence < 28) score = Math.min(score, 48);

  score = clamp(Math.round(score), 4, 96);

  const verdict = getVerdictBand(score, confidence);
  const primaryRisk = getPrimaryRisk(target, flags, volumeIntegrity, confidence);
  const summary = buildSummary(target, verdict, primaryRisk, volumeIntegrity, confidence);

  return {
    score,
    verdict,
    feeHealth,
    volumeIntegrity,
    confidence,
    primaryRisk,
    summary,
    checks: buildChecks(target, flags, volumeIntegrity),
    marketSignals: buildMarketSignals(target, flags, volumeIntegrity, confidence),
    layers: analysisLayers,
    knowledgeHits: getKnowledgeHits(flags, primaryRisk)
  };
}

export function getVerdictBand(score, confidence = 100) {
  if (confidence < 28) return { label: 'Data Belum Cukup', instruction: 'Jangan ape dulu', tone: 'warning' };
  if (score <= 25) return { label: 'Zona Bahaya', instruction: 'Hindari aja', tone: 'danger' };
  if (score <= 50) return { label: 'PvP Trench', instruction: 'Khusus scalper pro', tone: 'warning' };
  if (score <= 75) return { label: 'Mulai Matang', instruction: 'Masuk bertahap', tone: 'watch' };
  return { label: 'Kandidat Kuat', instruction: 'Layak dipantau serius', tone: 'good' };
}

function scoreAuthority(flags) {
  let score = 0;
  if (flags.mintRevoked === true) score += 10;
  if (flags.mintRevoked === false) score -= 24;
  if (flags.freezeActive === false) score += 8;
  if (flags.freezeActive === true) score -= 26;
  return score;
}

function scoreHolders(flags, phase, baseline) {
  let score = 0;
  const top10Pct = typeof flags.top10Pct === 'number' ? flags.top10Pct : null;
  const uniqueOwnerCount = typeof flags.uniqueOwnerCount === 'number' ? flags.uniqueOwnerCount : null;
  const commonFunderWallets = typeof flags.commonFunderWallets === 'number' ? flags.commonFunderWallets : null;
  const whales = Number(flags.whales || 0);
  const burners = Number(flags.burners || 0);
  const smartMoneyCount = Number(flags.smartMoneyCount || 0);
  const hasKol = Boolean(flags.kolDetected);

  if (typeof flags.top10Pct === 'number') {
    // Threshold sekarang relatif: fresh masih 68, tapi migrated pakai baseline
    const riskyThreshold = phase === 'fresh' ? 68 : 55;
    if (top10Pct > riskyThreshold) score -= 22;
    else if (top10Pct > 40) score -= 11;
    else if (top10Pct < 28) score += 9;
  }

  if (commonFunderWallets != null) {
    if (commonFunderWallets >= 7) score -= 24;
    else if (commonFunderWallets >= 4) score -= 13;
    else if (commonFunderWallets <= 1) score += 6;
  }

  if (uniqueOwnerCount != null) {
    if (uniqueOwnerCount <= 2) score -= 18;
    else if (uniqueOwnerCount <= 4 && burners >= 2) score -= 14;
    else if (uniqueOwnerCount <= 4) score -= 8;
    else if (uniqueOwnerCount >= 8) score += 5;
  }

  if (typeof flags.firstMinuteHoldingPct === 'number') {
    if (flags.firstMinuteHoldingPct < 35) score -= 14;
    else if (flags.firstMinuteHoldingPct > 70) score += 7;
  }

  if (typeof flags.cabalSync === 'number') {
    if (flags.cabalSync > 75) score -= 18;
    else if (flags.cabalSync > 55) score -= 9;
    else if (flags.cabalSync < 25) score += 5;
  }

  if (burners >= 5) score -= 22;
  else if (burners >= 3) score -= 14;
  else if (burners >= 1 && uniqueOwnerCount != null && uniqueOwnerCount <= 5) score -= 8;

  const smartSignal = smartMoneyCount + whales + (hasKol ? 2 : 0);
  const smartCap = top10Pct != null && top10Pct > 60 ? 8 : 18;
  if (smartSignal > 0) {
    const cleanEnough = burners <= 1 && (commonFunderWallets == null || commonFunderWallets < 4);
    const concentrationOk = top10Pct == null || top10Pct <= (phase === 'fresh' ? 72 : 62);
    const smartBonus = Math.min(smartCap, smartMoneyCount * 4 + whales * 3 + (hasKol ? 7 : 0));
    score += cleanEnough && concentrationOk ? smartBonus : Math.round(smartBonus * 0.35);
  }

  return score;
}

function scoreVolume(flags, volumeIntegrity, baseline) {
  let score = 0;
  if (volumeIntegrity < 25) score -= 22;
  else if (volumeIntegrity < 50) score -= 10;
  else if (volumeIntegrity > 72) score += 8;

  // Volume/liquidity ratio threshold sekarang relatif terhadap baseline p75
  const maxRatio = baseline.volumeLiquidityRatio.p75 * 1.2;
  if (flags.volumeLiquidityRatio > maxRatio) score -= 10;
  if (flags.txns5m > 160 && flags.volumeLiquidityRatio > baseline.volumeLiquidityRatio.p60) score -= 8;
  return score;
}

function scoreMarketing(flags) {
  if (flags.dexPaidTiming === 'late' && flags.pumpFromLowPct > 300) return -18;
  if (flags.dexPaidTiming === 'early') return 6;
  if (flags.activeBoosts > 0 && flags.pumpFromLowPct > 500) return -12;
  return 0;
}

function scoreCandle(flags) {
  if (flags.candleConfirmation >= 76) return 9;
  if (flags.candleConfirmation >= 55) return 4;
  if (flags.candleConfirmation < 35) return -15;
  return -4;
}

function scoreLiquidity(token, flags, baseline) {
  let score = 0;
  const liquidity = Number(token.liquidityUsd || 0);

  // Liquidity threshold sekarang relatif terhadap baseline
  const minLiquidity = baseline.liquidityUsd.p50 * 0.3; // 30% dari median
  const goodLiquidity = baseline.liquidityUsd.p75; // p75

  if (token.phase === 'migrated' && liquidity < minLiquidity) score -= 16;
  if (token.phase === 'migrated' && liquidity >= goodLiquidity) score += 7;
  if (flags.lpBurned === true) score += 7;
  return score;
}

function scoreUnknowns(flags, token) {
  let penalty = 0;
  if (flags.mintRevoked == null) penalty -= 7;
  if (flags.freezeActive == null) penalty -= 7;
  if (flags.top10Pct == null) penalty -= 4;
  if (flags.commonFunderWallets == null) penalty -= 3;
  if (!token.ca) penalty -= 12;
  return penalty;
}

function scoreExternalSignals(flags) {
  let score = 0;

  // MadeOnSol blacklist = hard rug flag
  if (flags.madeOnSolBlacklisted === true) score -= 32;

  // Birdeye LP locked status (only credible kalau true; null = belum kebaca)
  if (flags.birdeyeLpLocked === true) score += 8;
  else if (flags.birdeyeLpLocked === false) score -= 6;

  // Birdeye creator percentage (semakin tinggi semakin berbahaya)
  const creatorPct = Number(flags.birdeyeCreatorPct);
  if (Number.isFinite(creatorPct) && creatorPct > 0) {
    if (creatorPct >= 15) score -= 18;
    else if (creatorPct >= 8) score -= 10;
    else if (creatorPct <= 2) score += 4;
  }

  // Price discrepancy antar provider (Dex vs Birdeye vs Jupiter)
  if (flags.priceDiscrepancySuspicious === true) score -= 10;

  // Jupiter registry verification — terdaftar = legit-ish
  if (flags.jupiterRegistered === true) score += 5;

  return score;
}

function computeFeeHealth(flags) {
  const reportedVolume = Number(flags.reportedVolume || 0);
  const feeCollected = Number(flags.feeCollected || 0);
  if (!reportedVolume || !feeCollected) return null;
  const expectedFee = reportedVolume * 0.0025;
  return expectedFee > 0 ? clamp(Math.round((feeCollected / expectedFee) * 100), 0, 100) : null;
}

function computeVolumeIntegrity(flags, feeHealth, baseline) {
  if (feeHealth != null) return feeHealth;

  let score = 66;
  const ratio = Number(flags.volumeLiquidityRatio || 0);
  const txns5m = Number(flags.txns5m || 0);
  const buys = Number(flags.buys5m || 0);
  const sells = Number(flags.sells5m || 0);
  const total = buys + sells;

  // Volume/liquidity ratio threshold sekarang relatif
  const highRatio = baseline.volumeLiquidityRatio.p75 * 2;
  const medRatio = baseline.volumeLiquidityRatio.p75 * 1.2;
  const lowRatio = baseline.volumeLiquidityRatio.p60;

  if (ratio > highRatio) score -= 32;
  else if (ratio > medRatio) score -= 20;
  else if (ratio > lowRatio) score -= 9;
  else if (ratio > 0.2) score += 7;

  if (txns5m > 120 && ratio > lowRatio) score -= 11;
  if (total > 0) {
    const imbalance = Math.abs(buys - sells) / total;
    if (imbalance > 0.78 && txns5m > 40) score -= 12;
    if (imbalance < 0.35 && txns5m > 20) score += 6;
  }

  return clamp(Math.round(score), 0, 100);
}

function computeConfidence(token, flags) {
  let score = 14;
  if (token.ca) score += 10;
  if (token.provider?.includes('DexScreener') || token.source?.includes('Dex')) score += 21;
  if (token.source?.includes('Solana RPC') || token.rawProviders?.mint) score += 24;
  if (token.source?.includes('PumpPortal') || flags.pumpPortalTradeSeen) score += 12;
  if (flags.mintRevoked != null) score += 7;
  if (flags.freezeActive != null) score += 7;
  if (flags.reportedVolume > 0) score += 5;
  if (flags.top10Pct != null) score += 8;
  return clamp(score, 0, 96);
}

function getPrimaryRisk(token, flags, volumeIntegrity, confidence) {
  if (!token.ca) return 'contract belum dimasukin';
  if (confidence < 28) return 'bukti live belum cukup';
  if (flags.madeOnSolBlacklisted === true) return 'token masuk blacklist indexer';
  if (flags.freezeActive === true) return 'freeze authority aktif';
  if (flags.mintRevoked === false) return 'mint authority masih kebuka';
  if (Number(flags.birdeyeCreatorPct) >= 15) return 'creator pegang >15% supply';
  if (flags.priceDiscrepancySuspicious === true) return 'harga tidak konsisten antar provider';
  if (flags.burners >= 5) return 'banyak burner wallet di top holder';
  if (flags.commonFunderWallets >= 7) return 'monopoli bundle';
  if (flags.uniqueOwnerCount != null && flags.uniqueOwnerCount <= 3 && flags.burners > 0) return 'cluster owner sama burner wallet';
  if (flags.uniqueOwnerCount != null && flags.uniqueOwnerCount <= 2) return 'cluster owner top holder';
  if (volumeIntegrity < 25) return 'risiko wash trading / aktivitas palsu';
  if (flags.dexPaidTiming === 'late' && flags.pumpFromLowPct > 300) return 'timing exit liquidity';
  if (flags.top10Pct > 55) return 'supply holder terkonsentrasi';
  if (flags.candleConfirmation < 35) return 'falling knife';
  if (confidence < 45) return 'data publik masih terbatas';
  return 'risiko masih terkendali';
}

function buildSummary(token, verdict, primaryRisk, volumeIntegrity, confidence) {
  if (!token.ca) {
    return 'Nunggu input nih. Paste contract address buat jalanin live audit. Engine bakal cek anomali DexScreener, authority di Solana RPC, sama stream PumpPortal buat baca footprint dev & cabal.';
  }

  const dataLine = `[Keyakinan data live: ${confidence}% | Integritas volume: ${volumeIntegrity}%]`;
  const kol = token.flags?.kolDetected;
  const kolName = (kol && typeof kol === 'object' && kol.name) ? kol.name : null;
  const kolHandle = (kol && typeof kol === 'object' && kol.x) ? kol.x : 'handle tidak tercatat';
  const kolAlert = kolName ? `\nKOL ALERT: ${kolName} (${kolHandle}) terpantau memegang supply token ini.` : '';
  const smartAlert = token.flags?.smartMoneyCount > 0 ? `\nSMART MONEY: ${token.flags.smartMoneyCount} dompet smart/large holder terdeteksi di top holders. Ini sinyal positif kalau tidak bersamaan dengan burner/cluster berat.` : '';
  const whaleAlert = token.flags?.whales > 0 ? `\nWHALE: ${token.flags.whales} dompet dengan balance besar (> 250 SOL) berada di Top 10.` : '';
  const burnerAlert = token.flags?.burners > 0 ? `\nBURNER: ${token.flags.burners} dompet proxy/sekali pakai (balance < 0.05 SOL) ada di Top 10. Waspada indikasi bundle dev.` : '';
  const extraAlerts = `${kolAlert}${smartAlert}${whaleAlert}${burnerAlert}`;

  if (verdict.tone === 'danger') {
    return `${token.ticker} kedeteksi ada di zona ${verdict.label}. Risiko utama: ${primaryRisk}. ${dataLine}. Kesimpulan: ini kemungkinan gede rug pull atau trap. Jaga modal dan hindari jadi exit liquidity buat dev/cabal. Skip aja.${extraAlerts}`;
  }

  if (verdict.tone === 'warning') {
    return `${token.ticker} punya profil PvP keras. Risiko utama: ${primaryRisk}. ${dataLine}. Ada footprint wash trading atau holder terkonsentrasi. Kalo maksa masuk, pake sizing sekecil mungkin dan siap cut loss cepet buat scalp kilat. Jangan overstay.${extraAlerts}`;
  }

  if (verdict.tone === 'watch') {
    return `${token.ticker} lagi mulai matang dan narasi mulai kebentuk, tapi belum 100% aman. Risiko utama: ${primaryRisk}. ${dataLine}. Setup masuk akal kalo kamu mau DCA masuk bertahap. Pastiin punya titik invalidation yang jelas kalo support jebol.${extraAlerts}`;
  }

  return `${token.ticker} masuk kriteria Chad Ape. Setup chart sama struktur authority/holder sejauh ini nunjukin probabilitas tren sehat menurut metrik Ponyin. ${dataLine}. Peluang bagus buat entry, tapi tetep disiplin take profit di jalan dan jangan greedy. Memecoin bisa berubah arah dalam hitungan menit.${extraAlerts}`;
}

function buildChecks(token, flags, volumeIntegrity) {
  return [
    {
      label: 'Mint Revoked',
      status: statusFromBool(flags.mintRevoked, true),
      detail:
        flags.mintRevoked == null
          ? 'Belum kebaca dari Helius RPC.'
          : flags.mintRevoked
            ? 'Mint authority udah gak aktif.'
            : 'Mint authority masih kebuka.'
    },
    {
      label: 'Freeze Authority',
      status: statusFromBool(flags.freezeActive, false),
      detail:
        flags.freezeActive == null
          ? 'Belum kebaca dari Helius RPC.'
          : flags.freezeActive
            ? 'Freeze authority aktif, potensi honeypot/lock retail.'
            : 'Freeze authority gak aktif.'
    },
    {
      label: 'Likuiditas / LP',
      status: token.phase === 'migrated' && Number(token.liquidityUsd || 0) < 5000 ? 'fail' : Number(token.liquidityUsd || 0) > 25000 ? 'pass' : 'watch',
      detail: `${token.lpStatus || 'Status LP belum ketahu'}; likuiditas live sekitar ${formatUsd(Number(token.liquidityUsd || 0))}.`
    },
    {
      label: 'Risiko Bundle',
      status: flags.commonFunderWallets == null ? (flags.cabalSync > 70 ? 'warn' : 'watch') : flags.commonFunderWallets >= 7 ? 'fail' : flags.commonFunderWallets >= 4 ? 'warn' : 'pass',
      detail:
        flags.commonFunderWallets == null
          ? `Gagal narik data dompet dari Helius. Cabal proxy saat ini ${safePct(flags.cabalSync)}.`
          : `${flags.commonFunderWallets} top wallet terindikasi bagian dari bundle dev.`
    },
    {
      label: 'Distribusi Holder',
      status: flags.top10Pct == null ? 'watch' : flags.top10Pct > 55 ? 'fail' : flags.top10Pct > 40 ? 'warn' : 'pass',
      detail:
        flags.top10Pct == null
          ? 'Data Top Holders gagal ditarik dari Helius RPC.'
          : `Top 10 megang ${flags.top10Pct.toFixed(1)}% supply.`
    },
    {
      label: 'Keragaman Owner',
      status: flags.uniqueOwnerCount == null ? 'watch' : flags.uniqueOwnerCount <= 3 ? 'fail' : flags.uniqueOwnerCount <= 6 ? 'warn' : 'pass',
      detail:
        flags.uniqueOwnerCount == null
          ? 'Owner top holder belum bisa dinormalisasi dari RPC.'
          : `${flags.uniqueOwnerCount} owner unik kedeteksi dari top 10 token account. Makin dikit owner, makin tinggi risiko cluster.`
    },
    {
      label: 'Smart Money / KOL',
      status: flags.burners >= 3 ? 'warn' : (flags.kolDetected || flags.smartMoneyCount > 0 || flags.whales > 0) ? 'pass' : 'watch',
      detail: (flags.kolDetected && typeof flags.kolDetected === 'object' && flags.kolDetected.name)
        ? `KOL kedeteksi: ${flags.kolDetected.name} (${flags.kolDetected.x || 'handle tidak tercatat'}). ${flags.whales > 0 ? `Ada ${flags.whales} whale di Top 10.` : ''} Sinyal ini positif selama gak ada burner/cluster berat.`
        : flags.smartMoneyCount > 0 || flags.whales > 0
          ? `${flags.smartMoneyCount || 0} smart/large wallet dan ${flags.whales || 0} whale kedeteksi. Makin banyak dompet berkualitas makin baik, tapi tetep cek distribusi supply.`
          : 'Belum ada dompet Smart Money atau whale di top 10.'
    },
    {
      label: 'Burner Wallet',
      status: flags.burners == null ? 'watch' : flags.burners >= 5 ? 'fail' : flags.burners >= 2 ? 'warn' : 'pass',
      detail:
        flags.burners == null
          ? 'Belum bisa baca balance owner top holder.'
          : `${flags.burners} burner wallet kedeteksi di top holder. Burner tinggi lebih parah kalo owner unik dikit atau top10 supply gede.`
    },
    {
      label: 'Integritas Volume',
      status: volumeIntegrity < 25 ? 'fail' : volumeIntegrity < 55 ? 'warn' : 'pass',
      detail:
        flags.feeCollected != null
          ? `Kesehatan global fee ${volumeIntegrity}% dibanding volume yang dilaporin.`
          : `Proxy dari Dex volume/liquidity/txn: ${volumeIntegrity}%. Fee real butuh provider indexer.`
    },
    {
      label: 'Timing Dex Paid',
      status: flags.dexPaidTiming === 'late' && flags.pumpFromLowPct > 300 ? 'fail' : flags.dexPaidTiming === 'none' ? 'watch' : 'pass',
      detail:
        flags.dexPaidTiming === 'early'
          ? 'Boost/order kebaca relatif awal.'
          : flags.dexPaidTiming === 'late'
            ? `Marketing muncul setelah move sekitar +${flags.pumpFromLowPct}%.`
            : 'Belum ada sinyal paid/boost dari data publik.'
    },
    {
      label: 'Konfirmasi 3 Candle',
      status: flags.candleConfirmation > 70 ? 'pass' : flags.candleConfirmation > 45 ? 'warn' : 'fail',
      detail: `Keyakinan support ${safePct(flags.candleConfirmation)} dari tekanan buy/sell sama perubahan harga live.`
    }
  ];
}

function getKnowledgeHits(flags, primaryRisk) {
  const matched = new Set(['authority', 'globalFees', 'dexPaid', 'candle']);
  if (primaryRisk.includes('bundle') || flags.cabalSync > 55) matched.add('bundle');
  if (primaryRisk.includes('holder') || flags.top10Pct > 40) matched.add('holders');
  if (flags.txns5m > 0) matched.add('scalping');
  if (flags.smartMoneyCount > 0 || flags.whales > 0 || flags.kolDetected) matched.add('walletPing');
  return ponyinPrinciples.filter((item) => matched.has(item.id));
}

function buildMarketSignals(token, flags, volumeIntegrity, confidence) {
  const signals = [];
  const liquidity = Number(token.liquidityUsd || 0);
  const buys5m = Number(flags.buys5m || 0);
  const sells5m = Number(flags.sells5m || 0);
  const txns5m = Number(flags.txns5m || 0);
  const priceM5 = Number(token.priceChange?.m5 || 0);
  const priceH1 = Number(token.priceChange?.h1 || 0);
  const socialCount = Number(token.socials?.length || 0) + Number(token.websites?.length || 0);

  if (confidence < 45) {
    signals.push({
      tone: 'warn',
      title: 'Cakupan provider rendah',
      detail: 'Data live belum cukup lengkap buat entry gede. Anggep aja watchlist, bukan auto-buy.'
    });
  }

  if (liquidity > 0) {
    signals.push({
      tone: liquidity < 5000 ? 'danger' : liquidity < 25000 ? 'warn' : 'good',
      title: 'Kedalaman likuiditas',
      detail: liquidity < 5000
        ? 'Liquidity tipis. Slippage sama dump kecil bisa hancurin chart.'
        : liquidity < 25000
          ? 'Liquidity tradable tapi belum nyaman buat size gede.'
          : 'Liquidity relatif lebih sehat buat monitoring aktif.'
    });
  }

  if (txns5m > 0) {
    signals.push({
      tone: sells5m > buys5m * 2 ? 'danger' : buys5m > sells5m ? 'good' : 'warn',
      title: 'Tekanan order 5m',
      detail: `${buys5m}/${sells5m} buy/sell dalam 5 menit. Imbalance ekstrem harus dibaca bareng candle sama liquidity.`
    });
  }

  if (priceM5 || priceH1) {
    signals.push({
      tone: priceM5 < -15 || priceH1 < -35 ? 'danger' : priceM5 > 0 && priceH1 > -20 ? 'good' : 'warn',
      title: 'Momentum multi-frame',
      detail: `M5 ${formatSignedPct(priceM5)}, H1 ${formatSignedPct(priceH1)}. Jangan entry falling knife tanpa konfirmasi.`
    });
  }

  if (flags.whales > 0 || flags.burners > 0 || flags.smartMoneyCount > 0) {
    const smartWallets = Number(flags.smartMoneyCount || 0);
    const whales = Number(flags.whales || 0);
    const burners = Number(flags.burners || 0);
    signals.push({
      tone: burners >= 3 && burners > whales + smartWallets ? 'warn' : smartWallets + whales > 0 ? 'good' : 'warn',
      title: 'Proxy kualitas wallet',
      detail: `${whales} whale, ${smartWallets} smart/large wallet, ${burners} burner di top holders. Smart wallet nambah kualitas sinyal, burner nambah risiko bundle.`
    });
  }

  signals.push({
    tone: socialCount > 0 ? 'good' : 'warn',
    title: 'Jejak sosial/sumber',
    detail: socialCount > 0
      ? `${socialCount} link sosial/website kebaca dari provider. Tetep validasi manual sebelum percaya narasi.`
      : 'Belum ada link sosial/website dari provider. Risiko impersonation atau stealth deploy lebih tinggi.'
  });

  signals.push({
    tone: volumeIntegrity < 40 ? 'danger' : volumeIntegrity < 60 ? 'warn' : 'good',
    title: 'Proxy integritas volume',
    detail: `Skor integritas volume ${volumeIntegrity}%. Ini pake proxy public API; fee exact butuh indexer/backend.`
  });

  return signals.slice(0, 7);
}

function formatSignedPct(value) {
  const num = Number(value || 0);
  return `${num > 0 ? '+' : ''}${num.toFixed(Math.abs(num) >= 100 ? 0 : 1)}%`;
}

function statusFromBool(value, passValue) {
  if (value == null) return 'watch';
  return value === passValue ? 'pass' : 'fail';
}

function safePct(value) {
  return value == null ? 'unknown' : `${Math.round(value)}%`;
}

function formatUsd(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 'unknown';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(num >= 100_000 ? 0 : 1)}K`;
  return `$${num.toFixed(num >= 10 ? 0 : 2)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
