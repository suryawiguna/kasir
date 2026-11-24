# kasir-base

Aplikasi kasir (PWA) yang bisa disesuaikan untuk berbagai usaha F&B/retail kecil. Satu kode untuk semua klien; setiap toko mengatur produk, satuan, cara hitung stok, paket, cabang, harga per cabang, branding, dan fitur sendiri dari Pengaturan.

## Coba lokal (klien demo)

Butuh Node 22+ dan Java 21 (untuk emulator Firebase).

```bash
npm install
npm run emulators                 # terminal 1
npm run seed -- --client demo     # terminal 2: data Aneka Ayam (Setup A) + akun uji
npm run dev                       # buka http://localhost:3000
```

Masuk dengan `owner`, `kasir1` (Lapak Tikala), atau `kasir2` (Lapak Perkamil), kata sandi `test1234`.

## Pemeriksaan

```bash
npm run lint
npm test
npm run test:rules
npm run build
```

## Klien baru

```bash
npm run new-client -- <slug> "<Nama Toko>"
```

Lalu ikuti langkah yang dicetak (atau [docs/RUNBOOK.md](docs/RUNBOOK.md)).

Dokumentasi untuk developer: [CLAUDE.md](CLAUDE.md). Rencana: [docs/PLAN.md](docs/PLAN.md).
