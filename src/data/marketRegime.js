/**
 * marketRegime.js — Adaptive thresholds berdasarkan kondisi market real-time.
 *
 * Mengganti hard-coded constants dengan baseline relatif dari populasi feed.
 * Token dinilai relatif terhadap market SAAT INI (mania vs quiet regime), bukan
 * konstanta yang cepat usang.
 */

/**
 * Fallback constants — dipakai kalau feed terlalu kecil (<8 tokens).
 * Ini adalah nilai default dari engine lama.
 */
const FALLBACK_BASELINE = {
  regime: 'NORMAL',
  liquidityUsd: { p50: 15000, p60: 25000, p75: 50000 },
  volume5m: { p50: 2000, p60: 4000, p75: 8000 },
  volumeLiquidityRatio: { p50: 0.8, p60: 1.5, p75: 3.0 },
  txns5m: { p50: 15, p60: 25, p75: 50 },
  buyRatio: { p50: 0.52, p60: 0.58, p75: 0.65 },
  ageMinutes: { p50: 120, p60: 240, p75: 480 }
};

/**
 * Hitung percentile dari array angka.
 */
function percentile(values, p) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Compute market regime dari aggregate activity.
 * HOT = median txns5m >= 40 dan median volume5m >= 6000
 * QUIET = median txns5m < 12 atau median volume5m < 1500
 * NORMAL = di antara keduanya
 */
function computeRegime(stats) {
  const medianTxns = stats.txns5m.p50;
  const medianVolume = stats.volume5m.p50;

  if (medianTxns >= 40 && medianVolume >= 6000) return 'HOT';
  if (medianTxns < 12 || medianVolume < 1500) return 'QUIET';
  return 'NORMAL';
}

/**
 * Build regime baseline dari populasi feed tokens.
 * Ini dipanggil sekali per scan di refreshSignals().
 *
 * @param {array} tokens - array token dari fetchDiscoveryFeed()
 * @returns {object} baseline dengan percentiles + regime label
 */
export function buildRegimeBaseline(tokens) {
  if (!tokens || tokens.length < 8) {
    // Feed terlalu kecil, pakai fallback
    return { ...FALLBACK_BASELINE, feedSize: tokens?.length || 0, usedFallback: true };
  }

  const liquidityValues = [];
  const volume5mValues = [];
  const volumeLiqRatioValues = [];
  const txns5mValues = [];
  const buyRatioValues = [];
  const ageMinutesValues = [];

  for (const token of tokens) {
    const liq = Number(token.liquidityUsd || 0);
    const vol = Number(token.flags?.reportedVolume || 0);
    const txns = Number(token.flags?.txns5m || 0);
    const buys = Number(token.flags?.buys5m || 0);
    const sells = Number(token.flags?.sells5m || 0);
    const age = token.ageMinutes;

    if (liq > 0) liquidityValues.push(liq);
    if (vol > 0) volume5mValues.push(vol);
    if (liq > 0 && vol > 0) volumeLiqRatioValues.push(vol / liq);
    if (txns > 0) txns5mValues.push(txns);
    if (buys + sells > 0) buyRatioValues.push(buys / (buys + sells));
    if (age != null && age >= 0) ageMinutesValues.push(age);
  }

  const stats = {
    liquidityUsd: {
      p50: percentile(liquidityValues, 50) || FALLBACK_BASELINE.liquidityUsd.p50,
      p60: percentile(liquidityValues, 60) || FALLBACK_BASELINE.liquidityUsd.p60,
      p75: percentile(liquidityValues, 75) || FALLBACK_BASELINE.liquidityUsd.p75
    },
    volume5m: {
      p50: percentile(volume5mValues, 50) || FALLBACK_BASELINE.volume5m.p50,
      p60: percentile(volume5mValues, 60) || FALLBACK_BASELINE.volume5m.p60,
      p75: percentile(volume5mValues, 75) || FALLBACK_BASELINE.volume5m.p75
    },
    volumeLiquidityRatio: {
      p50: percentile(volumeLiqRatioValues, 50) || FALLBACK_BASELINE.volumeLiquidityRatio.p50,
      p60: percentile(volumeLiqRatioValues, 60) || FALLBACK_BASELINE.volumeLiquidityRatio.p60,
      p75: percentile(volumeLiqRatioValues, 75) || FALLBACK_BASELINE.volumeLiquidityRatio.p75
    },
    txns5m: {
      p50: percentile(txns5mValues, 50) || FALLBACK_BASELINE.txns5m.p50,
      p60: percentile(txns5mValues, 60) || FALLBACK_BASELINE.txns5m.p60,
      p75: percentile(txns5mValues, 75) || FALLBACK_BASELINE.txns5m.p75
    },
    buyRatio: {
      p50: percentile(buyRatioValues, 50) || FALLBACK_BASELINE.buyRatio.p50,
      p60: percentile(buyRatioValues, 60) || FALLBACK_BASELINE.buyRatio.p60,
      p75: percentile(buyRatioValues, 75) || FALLBACK_BASELINE.buyRatio.p75
    },
    ageMinutes: {
      p50: percentile(ageMinutesValues, 50) || FALLBACK_BASELINE.ageMinutes.p50,
      p60: percentile(ageMinutesValues, 60) || FALLBACK_BASELINE.ageMinutes.p60,
      p75: percentile(ageMinutesValues, 75) || FALLBACK_BASELINE.ageMinutes.p75
    }
  };

  const regime = computeRegime(stats);

  return {
    regime,
    ...stats,
    feedSize: tokens.length,
    usedFallback: false,
    timestamp: Date.now()
  };
}

/**
 * Cache baseline terakhir untuk dipakai di reevaluateSignal (per-token, tanpa feed).
 */
let cachedBaseline = null;

export function setCachedBaseline(baseline) {
  cachedBaseline = baseline;
}

export function getCachedBaseline() {
  return cachedBaseline || FALLBACK_BASELINE;
}

/**
 * Tighter time windows — phase-aware, untuk fast-meta market.
 * Ini mengganti DEX_DISCOVERY_MAX_AGE_MINUTES = 3 hari (terlalu lama).
 */
export const TIME_WINDOWS = {
  // Discovery feed: token maksimal umur berapa masih masuk feed
  discoveryMaxAge: {
    new: 90,        // bonding curve: 90 menit (1.5 jam)
    early: 240,     // early migrated: 4 jam
    migrated: 720,  // migrated: 12 jam (bukan 3 hari!)
    default: 360    // fallback: 6 jam
  },
  // Runner detector: token maksimal umur berapa masih bisa jadi runner
  runnerMaxAge: {
    new: 60,        // bonding: 1 jam
    early: 180,     // early: 3 jam
    migrated: 360,  // migrated: 6 jam (bukan 6 jam flat untuk semua)
    default: 240    // fallback: 4 jam
  }
};

/**
 * Get max age untuk discovery berdasarkan phase token.
 */
export function getDiscoveryMaxAge(phase) {
  return TIME_WINDOWS.discoveryMaxAge[phase] || TIME_WINDOWS.discoveryMaxAge.default;
}

/**
 * Get max age untuk runner berdasarkan phase token.
 */
export function getRunnerMaxAge(phase) {
  return TIME_WINDOWS.runnerMaxAge[phase] || TIME_WINDOWS.runnerMaxAge.default;
}
