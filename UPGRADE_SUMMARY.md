# Upgrade Summary — Platform Agent Trading Solana Memecoin

## 🎯 Tujuan Upgrade
Menjawab keluhan trader: **"tema berganti sangat cepat"** dan **"kehilangan momentum multi-X"** dengan tiga subsistem baru yang membuat platform lebih adaptif, lebih pintar baca narasi, dan mampu capture profit berkali-kali lipat.

---

## ✅ Subsistem yang Dibangun

### 1. **EXIT ENGINE MULTI-X** (Prioritas Tertinggi)
**File baru:** `src/data/exitEngine.js`

**Masalah yang diperbaiki:**
- ❌ **Sebelumnya:** TP di-cap +90% → setiap runner 10x dipaksa jual di +90%
- ❌ **Sebelumnya:** Binary SL/TP → token yang pump +300% lalu turun balik ke SL = LOSS
- ❌ **Sebelumnya:** Tidak ada trailing stop, tidak ada partial exit

**Solusi:**
- ✅ **Partial take-profit bertingkat:** 
  - T1 (+15%): exit 30%, move SL ke breakeven
  - T2 (+35%): exit 30% lagi
  - T3 (+60%): exit 20% lagi
  - Moonbag (20% sisa): trail dengan drawdown 18-28% dari peak → target 5-50x
- ✅ **Trailing stop:** setelah semua tier hit, sisa posisi di-trail dari peak price
- ✅ **Momentum-death exit:** jika velocity (price/volume/txns trend) berbalik negatif setelah profit, exit sebelum round-trip ke SL
- ✅ **Stop-to-breakeven:** setelah T1 hit, SL otomatis pindah ke entry → eliminasi "winner jadi loser"

**Perubahan di UI:**
- `SignalDetail.jsx`: tampilkan posisi tersisa, realized PnL, peak price, exit events (partial/trail/full)
- `SignalCard.jsx`: tampilkan posisi tersisa di card
- Trade object sekarang punya: `positionRemaining`, `realizedPnl`, `peakPrice`, `exitEvents[]`, `exitReason`

**Impact:** Platform sekarang bisa capture multi-X runner sambil protect profit. Tidak ada lagi cap +90%.

---

### 2. **NARRATIVE / META LAYER**
**File baru:** `src/data/narrativeDetector.js`

**Masalah yang diperbaiki:**
- ❌ **Sebelumnya:** Engine tidak pernah baca nama/ticker token → dua token dengan metrik on-chain identik dapat skor sama, padahal satu di tema panas dan satu tema mati
- ❌ **Sebelumnya:** Tidak ada deteksi tema saturated (terlalu banyak copycat)
- ❌ **Sebelumnya:** Tidak ada deteksi first-mover vs late copycat

**Solusi:**
- ✅ **Theme registry:** daftar tema yang mudah di-update (politik, celebrity, animal, AI-agent, tech-meme, dll.) dengan keyword matching
- ✅ **Meta clustering:** deteksi tema yang sedang panas dari clustering nama token di feed discovery
- ✅ **Saturation detection:** tema dengan ≥8 token = saturated (late entry = risiko exit liquidity)
- ✅ **First-mover detection:** dalam satu cluster tema, token paling awal + likuiditas terbesar = first-mover (bonus score)
- ✅ **Narrative score:** +12 untuk hot meta belum saturated, -10 untuk late copycat di tema saturated, +14 untuk first-mover

**Cara update tema:**
Edit `THEME_REGISTRY` di `src/data/narrativeDetector.js` — tambah/hapus tema atau adjust weight sesuai kondisi market.

**Perubahan di UI:**
- `SignalDetail.jsx`: tampilkan narrative signals di "Kenapa Sinyal Ini Muncul"
- Narrative score mempengaruhi grade (hot first-mover bisa naik dari A ke A+, late copycat bisa turun dari A ke B)

**Impact:** Platform sekarang bisa baca attention/narrative dimension, bukan cuma on-chain metrics. Tema yang lagi panas dapat prioritas, copycat late di-downgrade.

---

### 3. **ADAPTIVE THRESHOLDS**
**File baru:** `src/data/marketRegime.js`

**Masalah yang diperbaiki:**
- ❌ **Sebelumnya:** Semua threshold hard-coded (liquidity $8000, volume ratio >6, age >6 jam, dll.) → cepat usang saat market berubah
- ❌ **Sebelumnya:** Token dinilai dengan konstanta yang sama di mania maupun quiet market
- ❌ **Sebelumnya:** Time window terlalu lama (discovery 3 hari, runner 6 jam) → tidak cocok untuk fast-meta market

**Solusi:**
- ✅ **Regime baseline dari feed population:** setiap scan, hitung median/percentile (p50/p60/p75) dari liquidityUsd, volume5m, volumeLiquidityRatio, txns5m, buyRatio, ageMinutes dari seluruh token di feed
- ✅ **Relative thresholds:** token dinilai relatif terhadap baseline saat ini, bukan konstanta
  - Contoh: liquidity "sehat" = ≥ p50 * 0.5 (50% dari median market saat ini)
  - Contoh: volume ratio "tinggi" = > p75 * 1.5
- ✅ **Regime detection:** HOT (median txns ≥40 & volume ≥6000), QUIET (txns <12 atau volume <1500), NORMAL (di antara)
- ✅ **Tighter time windows (phase-aware):**
  - Discovery: new 90m, early 4h, migrated 12h (bukan 3 hari!)
  - Runner: new 1h, early 3h, migrated 6h (bukan 6h flat)
- ✅ **Cached baseline:** baseline dari scan terakhir di-cache untuk `reevaluateSignal` (price poll 6s) supaya tetap konsisten

**Perubahan di engine:**
- `runnerDetector.js`: liquidity threshold, volume ratio, age threshold sekarang relatif + phase-aware
- `apeEngine.js`: `scoreVolume`, `scoreLiquidity`, `computeVolumeIntegrity` sekarang pakai baseline relatif
- `autoTrader.js`: `refreshSignals()` build baseline sekali per scan, thread ke semua token

**Impact:** Platform sekarang adaptif terhadap kondisi market real-time. Threshold tidak usang. Token dinilai relatif terhadap populasi saat ini, bukan konstanta 6 bulan lalu.

---

## 📊 Perubahan Arsitektur

### Data Flow Baru (refreshSignals):
```
fetchDiscoveryFeed()
  ↓
buildMetaContext(tokens)        ← clustering tema, hot/saturated detection
buildRegimeBaseline(tokens)     ← percentiles, regime label
setCachedBaseline()             ← cache untuk reevaluateSignal
  ↓
tokens.map(token => 
  computeSignal(token, metaContext, regimeBaseline)
    ↓
    analyzeToken(token, regimeBaseline)      ← adaptive thresholds
    analyzeRug(token)
    analyzeRunner(token, regimeBaseline)     ← adaptive thresholds
    analyzeNarrative(token, metaContext)     ← meta layer
    ↓
    buildSignal(..., narrative)
      ↓
      gradeSignal(..., narrative)            ← narrative mempengaruhi grade
)
```

### Exit Flow Baru (applyPriceUpdates):
```
pollPrices() setiap 6s
  ↓
applyPriceUpdates(signals, trades, liveTokens)
  ↓
  untuk setiap trade ACTIVE:
    computeExitActions(trade, currentPrice, liveToken)
      ↓
      - cek SL hit
      - cek momentum death (velocity)
      - cek partial exit tiers (T1/T2/T3)
      - cek trailing stop (moonbag)
      ↓
    applyExitActions(trade, actions, currentPrice)
      ↓
      - update positionRemaining
      - update realizedPnl
      - update exitEvents[]
      - update status (WIN/LOSS/ACTIVE)
```

---

## 🔧 File yang Diubah

### File Baru:
- `src/data/exitEngine.js` — exit engine multi-X
- `src/data/narrativeDetector.js` — meta/narrative layer
- `src/data/marketRegime.js` — adaptive thresholds

### File Dimodifikasi:
- `src/data/autoTrader.js` — orchestration: integrate 3 subsistem, update trade object, update applyPriceUpdates
- `src/data/apeEngine.js` — adaptive thresholds di scoring functions
- `src/data/runnerDetector.js` — adaptive thresholds + tighter time windows
- `src/data/signalNarrative.js` — tambah narrative ke explain object
- `src/components/SignalDetail.jsx` — tampilkan exit events, posisi tersisa, realized PnL
- `src/components/SignalCard.jsx` — tampilkan posisi tersisa

---

## 🚀 Cara Pakai

### 1. Update Tema (Narrative Layer)
Edit `src/data/narrativeDetector.js` → `THEME_REGISTRY`:
```javascript
export const THEME_REGISTRY = [
  {
    id: 'ai-agent',
    label: 'AI Agent & Bot',
    keywords: ['agent', 'bot', 'gpt', 'claude', ...],
    weight: 1.3  // adjust weight sesuai seberapa hot tema ini
  },
  // tambah tema baru di sini
];
```

### 2. Monitoring Exit Events
Klik sinyal di dashboard → lihat section "Exit Events" di SignalDetail untuk track partial exits, trailing stop, dan momentum-death exits.

### 3. Backtest Stats
Performa panel sekarang menampilkan:
- Win rate (termasuk partial wins)
- Avg win % (bisa >100% karena multi-X)
- Total PnL % (realized + unrealized)
- Best trade % (bisa 500%+ sekarang, bukan cap 90%)

---

## 📈 Expected Impact

### Sebelum Upgrade:
- ❌ Setiap 10x runner dijual paksa di +90%
- ❌ Token pump +300% lalu turun ke SL = LOSS
- ❌ Tema panas vs tema mati dapat skor sama
- ❌ Threshold usang saat market berubah
- ❌ Late copycat di tema saturated lolos filter

### Setelah Upgrade:
- ✅ Multi-X runner di-capture dengan moonbag + trailing stop
- ✅ Profit di-protect dengan partial exits + stop-to-breakeven
- ✅ Tema panas dapat prioritas, late copycat di-downgrade
- ✅ Threshold adaptif terhadap kondisi market real-time
- ✅ First-mover di tema hot dapat bonus score

---

## ⚠️ Catatan Penting

1. **Masih mode simulasi:** Semua trade adalah backtest virtual, tidak ada eksekusi on-chain. Exit engine dirancang supaya gampang disambung ke eksekusi real nanti (action-based, pure functions).

2. **Narrative registry perlu maintenance:** `THEME_REGISTRY` harus di-update manual saat tema baru muncul atau tema lama mati. Ini trade-off untuk tidak depend ke API eksternal.

3. **Baseline cache:** Regime baseline di-cache dari scan terakhir untuk `reevaluateSignal`. Kalau market berubah drastis dalam 20 detik (antara scan), ada lag kecil sebelum baseline update.

4. **Exit events di localStorage:** Trade object sekarang lebih besar (ada `exitEvents[]`). Kalau ada ratusan trade, localStorage bisa penuh. Pertimbangkan cleanup trade lama secara periodik.

5. **Tighter time windows:** Token yang umurnya >12 jam (migrated) sekarang tidak masuk discovery feed. Ini by design untuk fast-meta market, tapi kalau ada legit slow-mover, mereka akan ter-exclude.

---

## 🎯 Next Steps (Opsional)

1. **Dev reputation layer:** Track funding wallet history untuk filter serial rugger (belum dibangun karena tidak diprioritaskan)
2. **Social velocity:** Integrate X/Telegram momentum sebagai leading indicator (butuh API key + backend)
3. **Real execution:** Wire exit engine ke Jupiter swap untuk trade on-chain (butuh wallet integration + security audit)
4. **Auto theme detection:** ML clustering untuk auto-detect tema baru tanpa manual update registry

---

**Build berhasil ✅** — Platform siap dijalankan dengan `npm run dev` atau `npm run build`.
