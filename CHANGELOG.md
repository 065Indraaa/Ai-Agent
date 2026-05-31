# CHANGELOG — Platform Agent Trading Solana Memecoin

## Version 2.0 — Multi-X Exit Engine + Narrative Layer + Adaptive Thresholds

### 🎯 Breaking Changes

**Data Reset:** Semua data lama (signals, trades, backtest history) di-reset otomatis saat pertama kali buka aplikasi versi 2.0. Ini karena struktur trade object berubah (tambah field baru untuk exit engine).

**LocalStorage Keys:**
- `ma_backtest` → `ma_backtest_v2`
- `ma_signals` → `ma_signals_v2`
- `ma_history_reset_v2` → flag reset otomatis
- `ma_signal_history_v2` → riwayat sinyal baru (max 500)

---

### ✨ Fitur Baru

#### 1. **Exit Engine Multi-X**
- ✅ Partial take-profit bertingkat (T1/T2/T3 + moonbag 20%)
- ✅ Trailing stop dari peak price
- ✅ Momentum-death exit (velocity rollover detection)
- ✅ Stop-to-breakeven setelah T1 hit
- ✅ Exit events tracking di UI

**Cara pakai:**
- Sinyal yang di-track akan otomatis pakai exit engine baru
- Klik sinyal → lihat "Exit Events" untuk track partial exits
- PnL sekarang blended (realized + unrealized)

#### 2. **Narrative / Meta Layer**
- ✅ Theme registry (10 tema default: politik, celebrity, AI-agent, animal, dll.)
- ✅ Deteksi tema panas vs saturated dari clustering nama token
- ✅ First-mover vs late copycat detection
- ✅ Narrative score mempengaruhi grade

**Cara update tema:**
Edit `src/data/narrativeDetector.js` → `THEME_REGISTRY`:
```javascript
{
  id: 'new-theme',
  label: 'New Theme Label',
  keywords: ['keyword1', 'keyword2', ...],
  weight: 1.2  // adjust sesuai seberapa hot tema ini
}
```

#### 3. **Adaptive Thresholds**
- ✅ Baseline relatif dari populasi feed (median/percentile)
- ✅ Regime detection (HOT/NORMAL/QUIET)
- ✅ Tighter time windows: discovery 12h, runner 1-6h phase-aware
- ✅ Threshold tidak usang — adaptif terhadap market real-time

**Cara kerja:**
- Setiap scan (20 detik), platform hitung baseline dari seluruh token di feed
- Token dinilai relatif terhadap baseline saat ini, bukan konstanta
- Baseline di-cache untuk price poll (6 detik)

#### 4. **Riwayat Sinyal dengan Pagination**
- ✅ Semua sinyal yang pernah muncul disimpan (max 500)
- ✅ Tampil di tab "Performa" dengan pagination (20 per halaman)
- ✅ Sortir dari terbaru ke terlama
- ✅ Tampilkan: token, grade, score, confidence, entry, liquidity, waktu

**Cara pakai:**
- Buka tab "Performa"
- Scroll ke bawah → lihat "Riwayat Sinyal"
- Navigasi dengan tombol prev/next

---

### 🔧 Environment Variables

**WAJIB:**
- `VITE_HELIUS_API_KEY` — Helius RPC untuk mint authority, top holders, dll.
- `VITE_SUPABASE_URL` — Supabase project URL untuk authentication
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key untuk authentication

**OPSIONAL:**
- `VITE_SMART_WALLETS` — Registry KOL/smart money (format: `address:name:type:twitter`)

Lihat `ENV_SETUP.md` untuk panduan lengkap cara daftar API keys.

---

### 📊 Perubahan Data Structure

#### Trade Object (Baru):
```javascript
{
  // Field lama (tetap ada)
  id, ca, ticker, name, grade, side, entry, sl, tp, slPct, tpPct, rr,
  status, openedAt, closedAt, closePrice, lastPrice, pnlPct, signal,
  
  // Field baru (exit engine)
  positionRemaining: 1.0,        // sisa posisi (0-1)
  realizedPnl: 0,                // PnL dari partial exits
  peakPrice: entry,              // peak price untuk trailing
  slMovedToBreakeven: false,     // flag SL sudah pindah ke breakeven
  tiers: null,                   // tier config (T1/T2/T3/moonbag)
  exitEvents: [],                // array exit events
  exitReason: null               // reason saat full exit
}
```

#### Signal Object (Baru):
```javascript
{
  // Field lama (tetap ada)
  id, ca, ticker, name, phase, grade, side, confidence, reasons, score,
  entry, sl, tp, slPct, tpPct, rr, priceUsd, liquidityUsd, age, ageMinutes,
  m5, h1, url, tracked, explain, updatedAt,
  
  // Field baru (narrative)
  narrative: {
    themes: ['ai-agent', 'tech-meme'],
    isHotMeta: true,
    isSaturated: false,
    isFirstMover: true,
    narrativeScore: 14,
    signals: ['Tema sedang panas', 'First-mover di cluster']
  }
}
```

#### Signal History (Baru):
```javascript
{
  ...signal,                     // semua field dari signal object
  firstSeenAt: timestamp,        // pertama kali muncul
  lastSeenAt: timestamp          // terakhir kali di-update
}
```

---

### 🚀 Cara Upgrade dari v1.0

1. **Backup data lama (opsional):**
   - Buka DevTools → Application → Local Storage
   - Copy `ma_backtest` dan `ma_signals` kalau mau simpan

2. **Pull code baru:**
   ```bash
   git pull origin main
   npm install
   ```

3. **Setup environment variables:**
   - Copy `.env.example` ke `.env` (kalau ada)
   - Isi `VITE_HELIUS_API_KEY` dan `VITE_SUPABASE_*`
   - Lihat `ENV_SETUP.md` untuk panduan lengkap

4. **Jalankan aplikasi:**
   ```bash
   npm run dev
   ```

5. **Data akan di-reset otomatis:**
   - Saat pertama kali buka, semua data lama di-reset
   - Ini normal karena struktur data berubah
   - Mulai fresh dengan exit engine baru

---

### 📈 Expected Impact

**Sebelum v2.0:**
- ❌ Cap TP +90% → 10x runner dijual paksa di +90%
- ❌ Pump +300% lalu turun ke SL = LOSS
- ❌ Tema panas vs mati dapat skor sama
- ❌ Threshold usang saat market berubah
- ❌ Tidak ada riwayat sinyal

**Setelah v2.0:**
- ✅ Multi-X runner di-capture dengan moonbag + trailing
- ✅ Profit di-protect dengan partial exits + stop-to-breakeven
- ✅ Tema panas dapat prioritas, late copycat di-downgrade
- ✅ Threshold adaptif terhadap kondisi market real-time
- ✅ Riwayat sinyal lengkap dengan pagination

---

### ⚠️ Known Issues & Limitations

1. **Signal history max 500:** Setelah 500 sinyal, yang terlama akan dihapus otomatis. Ini untuk prevent localStorage overflow.

2. **Narrative registry manual:** `THEME_REGISTRY` harus di-update manual saat tema baru muncul. Tidak ada auto-detection dari social media (butuh API eksternal).

3. **Baseline cache lag:** Regime baseline di-cache dari scan terakhir (20 detik). Kalau market berubah drastis dalam 20 detik, ada lag kecil sebelum baseline update.

4. **Exit engine hanya simulasi:** Semua exit masih virtual (backtest). Untuk eksekusi on-chain, butuh wallet integration + Jupiter swap (belum dibangun).

5. **Tighter time windows:** Token >12 jam (migrated) tidak masuk discovery feed. Ini by design untuk fast-meta market, tapi legit slow-mover akan ter-exclude.

---

### 🔮 Roadmap (Future)

- [ ] Dev reputation layer (track funding wallet history)
- [ ] Social velocity integration (X/Telegram momentum)
- [ ] Real execution (wire exit engine ke Jupiter swap)
- [ ] Auto theme detection (ML clustering)
- [ ] Export signal history ke CSV
- [ ] Advanced filters di riwayat sinyal (by grade, by date range, dll.)

---

**Version:** 2.0.0  
**Release Date:** 2026-05-31  
**Build:** ✅ Verified
