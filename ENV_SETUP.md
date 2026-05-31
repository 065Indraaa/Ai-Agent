# Environment Variables — Platform Agent Trading Solana Memecoin

## Required Environment Variables

Buat file `.env` di root project dengan isi berikut:

```env
# Helius RPC API Key (untuk Solana RPC calls)
# Daftar gratis di: https://helius.dev
# Digunakan untuk: mint authority check, top holders, token account info
VITE_HELIUS_API_KEY=your_helius_api_key_here

# Supabase (untuk authentication)
# Daftar gratis di: https://supabase.com
# Digunakan untuk: login/logout user
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Smart Wallets Registry (opsional)
# Format: address:name:type:twitter_handle
# Contoh: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:Ansem:KOL:@blknoiz06
# Digunakan untuk: deteksi KOL/smart money di top holders
VITE_SMART_WALLETS=
```

## Cara Daftar API Keys

### 1. Helius (WAJIB)
1. Buka https://helius.dev
2. Sign up gratis
3. Buat project baru
4. Copy API key dari dashboard
5. Paste ke `VITE_HELIUS_API_KEY`

**Kenapa wajib:** Platform butuh Helius RPC untuk:
- Cek mint authority & freeze authority (keamanan token)
- Ambil top 10 holders & distribusi supply
- Deteksi burner wallet & bundle dev

### 2. Supabase (WAJIB untuk login)
1. Buka https://supabase.com
2. Sign up gratis
3. Buat project baru
4. Di Settings → API:
   - Copy "Project URL" → paste ke `VITE_SUPABASE_URL`
   - Copy "anon public" key → paste ke `VITE_SUPABASE_ANON_KEY`
5. Di Authentication → Providers:
   - Enable "Email" provider
   - (Opsional) Enable "Google" atau provider lain

**Kenapa wajib:** Platform butuh Supabase untuk:
- Login/logout user
- Session management

### 3. Smart Wallets Registry (OPSIONAL)
Format: `address:name:type:twitter_handle`

Contoh:
```env
VITE_SMART_WALLETS=7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:Ansem:KOL:@blknoiz06,GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE:Wallet 2:Smart Wallet:@handle2
```

**Kenapa opsional:** Ini untuk deteksi KOL/smart money di top holders. Kalau tidak diisi, platform tetap jalan tapi tidak ada label KOL.

## Backend API (OPSIONAL)

Platform ini bisa jalan **tanpa backend** (pure frontend + RPC calls). Tapi kalau kamu punya backend untuk:
- `/api/birdeye` — Birdeye token overview
- `/api/jupiter` — Jupiter price & token registry
- `/api/pumpfun` — Pump.fun discovery feed
- `/api/smart-wallets` — Smart wallet registry
- `/api/token-intel` — Token intel (MadeOnSol, global fees, dll.)

Maka platform akan pakai data dari backend tersebut. Kalau backend tidak ada, platform fallback ke data dari DexScreener + Helius RPC saja.

## Verifikasi Setup

Setelah isi `.env`, jalankan:
```bash
npm run dev
```

Buka browser, cek console:
- ✅ Kalau tidak ada error "Helius RPC" → Helius API key valid
- ✅ Kalau bisa login → Supabase setup valid
- ✅ Kalau feed muncul → semua OK

## Troubleshooting

### Error: "Helius RPC gagal"
- Cek `VITE_HELIUS_API_KEY` sudah diisi
- Cek API key valid (copy paste dari Helius dashboard)
- Cek quota Helius belum habis (free tier: 100k requests/bulan)

### Error: "Supabase auth failed"
- Cek `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` sudah diisi
- Cek URL tidak ada trailing slash
- Cek anon key (bukan service_role key!)

### Feed kosong / "Belum ada token live"
- Ini normal kalau market sepi
- Tunggu 20 detik (auto-refresh)
- Atau klik "Perbarui Sinyal" manual
