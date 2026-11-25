# CLAUDE.md

Panduan untuk Claude Code di repo ini.

## Proyek

`kasir-base`: satu kode aplikasi kasir (PWA) untuk banyak usaha F&B/retail kecil. Perbedaan antar toko diatur lewat **konfigurasi dan data**, bukan kode. Klien pertama: Aneka Ayam Manado (2 cabang, Tikala & Perkamil). Rencana lengkap: [docs/PLAN.md](docs/PLAN.md).

Stack: React 19, Vite 6, TypeScript, Tailwind v4, Firebase (Firestore + Auth + Hosting) paket Spark, `vite-plugin-pwa` mode `prompt`, Vitest, emulator Firebase untuk tes rules.

Referensi: repo `Haoshii-Dimsum-POS` (produksi). **Hanya dibaca.** Jangan commit, push, atau deploy ke sana: push ke `main` Haoshii langsung men-deploy toko yang sedang jualan.

## Alur kerja

- **Edit, laporkan, tunggu persetujuan** sebelum commit/push.
- Kerjakan per fase (PLAN §9). Setiap fase berakhir dengan `npm run lint`, `npm test`, `npm run test:rules` hijau.
- Semua teks yang dilihat pengguna dalam Bahasa Indonesia, sentence case. Istilah baku: **No. HP**, **Ekspor**, **kata sandi**, **Bayar**.

## Prinsip utama: tidak ada asumsi bisnis di kode

Setiap pilihan (cara hitung stok, satuan, kategori, isi paket, harga per cabang, fitur, status awal pesanan, kebijakan stok habis) diatur pemilik dari Pengaturan, dengan nilai awal yang masuk akal. Kalau tergoda menulis `if (product.id === ...)` atau nama satuan/menu di kode: jangan. Jadikan data atau setting.

## Perintah

```bash
npm run dev          # klien demo (project demo-kasir) → otomatis ke emulator
npm run emulators    # Firestore + Auth emulator (Java 21)
npm run seed -- --client demo     # isi emulator: Setup A Aneka Ayam + akun uji
npm run lint         # tsc --noEmit + scripts/check-paths.mjs
npm test             # modul murni
npm run test:rules   # firestore.rules di emulator (Java 21)
npm run build        # CLIENT=<slug> untuk klien lain (default demo)
npm run set-admin -- --client <slug> <username> <kata-sandi> <owner|staff> [--branch <id>]
npm run new-client -- <slug> "<Nama Toko>"
npm run deploy -- --client <slug> | --all
npm --prefix worker run dev       # Worker foto lokal di :8787 (salin worker/.dev.vars.example ke .dev.vars)
```

Akun uji emulator (dari `clients/demo/seed.json`): `owner`, `kasir1` (cabang tkl), `kasir2` (cabang pkm), kata sandi `test1234`.

Demo online: klien `kasir-demo` (project Firebase `kasir-demo`) di https://kasir-demo.web.app, data umum (Cabang A/B, Produk A–F), akun `owner`, `kasira`, `kasirb`. Kata sandinya dibagikan ke calon klien: anggap isinya publik. `npm run seed -- --client kasir-demo --force` mengembalikan katalog dan stok, tetapi tidak menghapus pesanan.

Emulator butuh Java 21 (Temurin 21 terpasang di Mac ini lewat `brew install --cask temurin@21`; `brew install openjdk@21` gagal karena macOS ini Tier 3 dan butuh Xcode untuk kompilasi). Emulator bind ke `0.0.0.0` supaya HP di Wi-Fi yang sama bisa memakai `npm run dev` + emulator di laptop.

## Arsitektur

### Satu project Firebase per klien

- `clients/<slug>/client.json`: Firebase web config, `usernameDomain`, URL. Dipilih saat build dengan `CLIENT=<slug>` dan disuntik sebagai `__CLIENT__` ([vite.config.ts](vite.config.ts), [src/client.ts](src/client.ts)). Modul yang dites tidak boleh mengimpor `src/client.ts`.
- `clients/<slug>/seed.json`: isi awal toko. `clients/<slug>/service-account.json`: kredensial, di-gitignore.
- Project id `demo-*` selalu ke emulator (aplikasi dan semua script).
- **Semua akses koleksi lewat [src/data/paths.ts](src/data/paths.ts)** (`shopCol`, `shopDoc`, `shopSingleton`, `newId`). `npm run lint` menolak `collection(db` / `doc(db` di file lain. Multi-tenant nanti = ubah paths.ts + rules saja.

### Gerbang di [App.tsx](src/App.tsx)

Auth → claims (`accessProblem`) → `ShopProvider` (config, fitur, cabang, kategori, item stok, produk) → `DeviceProvider` (cabang + huruf perangkat di localStorage) → `BranchProvider` (stok + 100 pesanan cabang) → tab di `src/pages/`. App.tsx tidak menyimpan state bisnis. Jangan biarkan tumbuh jadi god component seperti di Haoshii.

### Model data ([src/domain/types.ts](src/domain/types.ts))

- **Semua jumlah stok dan jual = integer satuan dasar** (gram untuk kg, ml untuk liter). Konversi hanya di [units.ts](src/features/units/units.ts).
- `stockItems` (barang yang dihitung) terpisah dari `products` (barang yang dijual). `product.consumes` = item stok per 1 satuan jual. `stockMode`: `own` (item stok `own-<productId>` dibuat otomatis), `shared`, `none`.
- `choiceGroups`: paket "pilih 3 ayam", varian, level pedas. Opsi punya `consumes` dan `priceDelta` sendiri.
- `inventory/{branchId}`: satu dokumen per cabang, `levels` map, selalu `increment()` (lewat `FieldPath('levels', id)`).
- **Setiap baris pesanan menyimpan snapshot `consumed`.** Batal dan Ubah Item memakai snapshot, bukan produk saat ini, jadi pemilik bebas mengganti mode stok/isi paket.

### Modul murni yang dites (di sinilah uang dan stok)

| Modul | Kenapa |
|---|---|
| [stock/consumption.ts](src/features/stock/consumption.ts) | satu-satunya tempat aritmetika stok: konsumsi, bonus, pilihan, delta batal/ubah, kekurangan |
| [pricing/pricing.ts](src/features/pricing/pricing.ts) + [lib/intMath.ts](src/lib/intMath.ts) | satu-satunya pembulatan rupiah (`lineTotal`, integer, tanpa float) |
| [pricing/money.ts](src/features/pricing/money.ts) | format uang hanya lewat `formatRupiah`/`formatAmount` |
| [units/units.ts](src/features/units/units.ts) | tampil ↔ dasar, parse input "1,5" |
| [orders/orderNumber.ts](src/features/orders/orderNumber.ts) | `YYYYMMDD-<cabang><huruf><NNNN>`, tidak bentrok antar perangkat |
| [orders/buildOrder.ts](src/features/orders/buildOrder.ts) | aturan checkout dan terima pembayaran |
| [pos/cart.ts](src/features/pos/cart.ts) | keranjang, harga, snapshot baris |
| [lib/businessDate.ts](src/lib/businessDate.ts) | hari bisnis per zona (Manado = WITA) |
| shop/claims/device/featureFlags | parsing dokumen dan claims dengan default aman |

Menambah aturan di salah satunya = menambah tes. Tes yang merender komponen tidak dibuat (butuh Firebase di-mock).

### Keputusan dari Haoshii yang dipertahankan

- **Jangan pernah `await` write Firestore** → [queuedWrite](src/data/queuedWrite.ts). Satu-satunya await: login.
- Pesanan + stok dalam satu `writeBatch`; stok selalu `increment()`; handler menerima `Order` utuh.
- Tidak ada seeding dari aplikasi. Snapshot kosong dari cache ≠ tidak ada data. Listener memakai `includeMetadataChanges: true`, karena snapshot kosong yang lalu dikonfirmasi server hanya berubah metadata (tanpa ini kasir di cabang tanpa pesanan menunggu selamanya; ditemukan saat uji di browser).
- `isCheckoutReady` sebelum checkout.
- Uang tunai selalu diketik kasir (tombol saran = ketukan kasir), kembalian diturunkan, tidak disimpan. `paymentMethod` kosong sampai uang diterima.
- Semua overlay lewat `Drawer` (portal, transisi, geser untuk menutup); Back/Escape lewat `useBackClose` (port Haoshii). Jangan panggil `useBackClose` lagi untuk Drawer.
- Update aplikasi hanya saat kasir tidak sibuk (`setTillBusy`).
- Tidak ada hapus pesanan dari aplikasi.

### Foto produk dan logo (R2)

Rencana dan alasan: [docs/IMAGES-PLAN.md](docs/IMAGES-PLAN.md).

- Worker `kasir-media` di [worker/](worker/src/handler.ts), satu untuk semua klien, **satu bucket R2 per klien** (binding `BUCKET_<SLUG>` + entri `CLIENTS` di `wrangler.toml`, kunci = project id Firebase). Bukan Worker/bucket Haoshii.
- Fitur unggah menyala bila `client.json` punya `workerUrl` (klien `demo` → `http://localhost:8787`). Tidak ada cek nama klien.
- Firestore hanya menyimpan **key**, bukan URL: `products/{id}.image`, `config/shop.logo`. Pola key di [imageKeys.ts](src/features/media/imageKeys.ts), dipakai aplikasi dan Worker; regex yang sama di rules. `logoUrl` lama masih dibaca.
- Nama file = hash isi, jadi cache `immutable` dan Workbox `CacheFirst` aman. `<img>` hanya di `ProductImage`/`ShopLogo`/`ImagePicker` (dicek `npm run lint`).
- Unggah boleh di-`await` (butuh internet); simpan key ke Firestore tetap lewat `queueWrite` saat Simpan.
- Uji lokal: emulator + `media-worker` + `kasir-demo` di `.claude/launch.json`. Unggah dari HP lewat IP LAN tidak jalan (`crypto.subtle` butuh https/localhost).

### Design system

UI memakai design system Haoshii (komponen, token, Nunito, shell) dengan warna brand dari `config/shop.brandColor`. Aturannya di [docs/DESIGN.md](docs/DESIGN.md). Jangan menulis gaya tombol/field/overlay langsung di halaman; pakai class di `index.css` dan komponen di `src/components/`. Dropdown pakai `SelectMenu`, bukan `<select>`.

Catatan dev: menambah class Tailwind baru (terutama `@utility`) kadang tidak muncul di dev server sampai `src/index.css` disentuh atau server di-restart. Build produksi tidak terpengaruh.

### Auth dan peran

Username → `<username>@<usernameDomain>`. Claims (`set-admin`): `admin`, `role` (`owner`|`staff`), `branchId` (wajib untuk staf). Staf hanya membaca/menulis pesanan, stok, dan hitung stok cabangnya, ditegakkan di rules. Pembatalan, ubah pembayaran lunas, katalog, dan pengaturan = pemilik.

### Firestore rules

Allowlist field, deny-by-default, cap audit = email token, `updatedAt` wajib berubah di setiap update pesanan. **Setiap aturan baru wajib punya kasus di [tests/rules/](tests/rules/firestore.rules.test.ts).** Rules tidak bisa iterasi list; isi `items` dijaga TypeScript.

## Status per fase

- Fase 0–3: selesai (fondasi, config/branding/auth/cabang, produk/satuan/stok, kasir + checkout offline).
- Fase 4: sebagian. Ada daftar pesanan, detail, ubah status, terima pembayaran, batal (stok kembali dari snapshot), tandai belum bayar. **Belum:** Ubah Item, struk thermal/browser.
- Fase 6: foto produk dan logo lewat Worker R2 sudah ada di kode dan teruji lokal; belum di-deploy ke kasir-demo (IMAGES-PLAN G4).
- Fase 5, 7, 8 dan sisa Fase 6: belum (analitik, ekspor CSV, pelanggan sebagai dokumen, event, hitung kas, deploy per tag rilis, backup matrix).
