# Rencana: Basis Aplikasi Kasir yang Bisa Disesuaikan

Nama kerja repo: `kasir-base` (ganti sesuai keinginan).
Klien pertama: **Aneka Ayam Manado** (2 cabang: Tikala & Perkamil).
Referensi: repo `suryawiguna/Haoshii-Dimsum-POS` (produksi, jangan diubah).

---

## 0. Cara memakai dokumen ini (untuk Claude Code)

- Ini repo **baru**. Haoshii hanya dibaca sebagai referensi. Jangan commit, push, atau deploy apa pun ke repo Haoshii, karena push ke `main` Haoshii langsung men-deploy toko yang sedang jualan.
- Salin **pola dan modul**, bukan riwayat git. Saat memindahkan modul dari Haoshii, buang semua yang khusus dimsum (`dimsumPcs`, `chiliOil*`, ID menu `cos`/`col`, `@haoshii.local`, `haoshii:` di localStorage, dll).
- Baca `CLAUDE.md`, `docs/QUOTA.md`, `docs/DESIGN.md` dan `docs/HISTORY.md` di Haoshii sebelum mulai. Banyak keputusan di sana lahir dari bug produksi dan harus dipertahankan (lihat bagian 6).
- Kerjakan per fase (bagian 9). Setiap fase berakhir dengan `npm run lint`, `npm test`, dan `npm run test:rules` hijau.
- Alur kerja sama dengan Haoshii: **edit, laporkan, tunggu persetujuan** sebelum commit/push.
- Semua teks yang dilihat pengguna dalam Bahasa Indonesia, sentence case. Istilah baku: **No. HP**, **Ekspor**, **kata sandi**, **Bayar**.

---

## 1. Tujuan

Satu kode yang bisa dipakai banyak jenis usaha F&B/retail kecil, dengan perbedaan antar toko diatur lewat **konfigurasi dan data**, bukan lewat kode.

**Prinsip utama: tidak ada asumsi bisnis di kode.** Setiap pilihan (cara hitung stok, satuan, kategori, isi paket, harga per cabang, fitur) diatur **pemilik toko sendiri** dari Pengaturan, dengan nilai awal yang masuk akal dan bisa diubah kapan saja. Developer tidak perlu tahu jawaban "stok dihitung per ukuran atau total" untuk membangun aplikasinya. Pemilik yang memilih saat setup, dan bisa mengganti pilihannya nanti tanpa merusak data lama (karena setiap pesanan menyimpan snapshot, lihat 3.3).

Yang harus bisa diatur pemilik tanpa menyentuh kode:

| Aspek | Contoh dimsum | Contoh ayam |
|---|---|---|
| Satuan jual | pcs, botol | ekor, pasang, kg |
| Jumlah desimal | tidak | ya (kaki 1,5 kg) |
| Paket/bundling | Dimsum isi 8 memotong 8 pcs | Paket hemat memotong 3 ekor |
| Bonus gratis | Chili oil gratis | (belum) |
| Cabang | 1 | 2, stok dan laporan terpisah |
| Branding | nama, logo, warna, struk | nama, logo, warna, struk |
| Fitur | Event, QRIS, Kas, Foto bukti, dll | sama, on/off per toko |
| Cara hitung stok | 1 stok "Dimsum" dipakai bersama semua varian | total ekor, **atau** per ukuran, pemilik yang pilih |
| Isi paket | tetap (isi 8) | tetap, **atau** dipilih saat jual (3 ekor ukuran bebas) |
| Kategori | dibuat pemilik | dibuat pemilik |
| Satuan | preset + satuan buatan sendiri | preset + satuan buatan sendiri |

## 2. Batasan (sengaja tidak dikerjakan dulu)

- Meja restoran, split bill, dapur multi-station
- Resep bahan baku (1 menu memotong gram tepung, minyak, dll)
- Member/poin, voucher, diskon per pelanggan
- Integrasi GoFood/GrabFood, payment gateway, webhook QRIS
- Multi-tenant dalam satu project Firebase (disiapkan jalurnya, lihat 3.2)
- Aplikasi native. Tetap PWA

Fitur di atas baru dikerjakan kalau ada klien nyata yang butuh dan bayar.

---

## 3. Keputusan arsitektur

### 3.1 Stack (sama dengan Haoshii)

React 19, Vite 6, TypeScript, Tailwind v4, Firebase (Firestore, Auth, Hosting) di paket **Spark**, PWA (`vite-plugin-pwa` mode `prompt`), Vitest, Firebase emulator untuk tes rules, Cloudflare Worker + R2 untuk file.

### 3.2 Satu project Firebase per klien, kode tenant-aware

- Setiap klien punya project Firebase sendiri, sehingga setiap klien dapat kuota gratis sendiri dan kesalahan di satu klien tidak menular.
- Satu kode untuk semua klien. Perbedaan per klien ada di:
  - `clients/<slug>/client.json`: project id, Firebase web config, URL hosting, slug R2
  - Dokumen Firestore `config/shop`: branding, satuan, fitur, cabang (bisa diubah pemilik dari aplikasi)
- **Semua akses koleksi lewat satu helper**, misalnya `shopCol('orders')` / `shopDoc('config', 'shop')` di `src/data/paths.ts`. Sekarang helper ini mengembalikan path top-level. Kalau nanti pindah ke multi-tenant, cukup helper ini (dan rules) yang diubah menjadi `tenants/{tenantId}/...`.
- Dilarang memanggil `collection(db, 'orders')` langsung di luar `paths.ts`. Tambahkan pengecekan sederhana (script grep di CI) supaya aturan ini tidak dilanggar.

### 3.3 Produk terpisah dari item stok

Pelajaran dari Haoshii: stok tertanam di 3 penghitung tetap, dan bonus gratis tidak bisa dihitung dengan benar.

- **`stockItems`**: barang yang dihitung di rak/freezer (contoh: "Ayam utuh" dalam ekor, "Kaki ayam" dalam gram, "Dimsum" dalam pcs).
- **`products`**: barang yang dijual di kasir, dengan harga. Setiap produk punya `consumes`: daftar item stok dan jumlah yang terpotong per 1 unit terjual.
  - "Ayam Segar 40K" → consumes `[{ ayam: 1 }]`
  - "Paket Hemat 120K" → consumes `[{ ayam: 3 }]`
  - "Kaki Ayam (kg)" → dijual per berat, consumes `kaki` sesuai berat yang ditimbang
  - "Dimsum Mentai 8 pcs" → consumes `[{ dimsum: 8 }]`
  - Produk tanpa `consumes` tidak memotong stok (misalnya jasa, minuman titipan)
- **Cara hitung stok dipilih pemilik per produk** (`stockMode`), di editor Produk:
  - **Stok sendiri**: produk punya item stok sendiri. Editor membuat item stoknya otomatis (contoh: setiap ukuran ayam dihitung terpisah).
  - **Pakai stok bersama**: produk memotong item stok yang sudah ada (contoh: semua ukuran ayam memotong "Ayam utuh", atau semua varian dimsum memotong "Dimsum").
  - **Tidak dilacak**: tidak memotong stok.
  - Pemilik bisa mengganti mode kapan saja. Perubahan berlaku untuk penjualan berikutnya. Pesanan lama tetap benar karena snapshot.
- **Paket bisa tetap atau dipilih saat jual** (`choiceGroups`):
  - Tetap: "Paket Hemat 120K" selalu memotong 3 ekor dari item stok tertentu.
  - Pilihan: "Paket Hemat 120K" berisi grup "Pilih 3 ayam" dengan opsi ukuran 35K-55K. Kasir memilih saat jual, stok terpotong sesuai pilihan. Grup bisa mengizinkan pilihan yang sama berulang (3× ukuran 40K) atau tidak.
  - Pilihan juga bisa dipakai untuk varian biasa (rasa, level pedas) dengan atau tanpa tambahan harga.
- **Setiap baris pesanan menyimpan snapshot konsumsi** (`consumed`). Batal pesanan dan Ubah Item mengembalikan stok dari snapshot ini, bukan dari data produk saat ini. Ini juga berlaku untuk bonus gratis, yang menyelesaikan masalah `freeItem` tanpa `pcs` di Haoshii.

### 3.4 Satuan dan jumlah desimal

- Simpan semua jumlah stok dan jumlah jual sebagai **integer dalam satuan dasar**, supaya tidak ada error pembulatan float dan `increment()` tetap aman:
  - kg → disimpan dalam gram
  - liter → ml
  - ekor, pcs, pasang → 1
- Pemilik bisa menambah, mengubah nama, dan menyembunyikan satuan di Pengaturan → Satuan (contoh: "ikat", "porsi", "tray"). Satuan yang sudah dipakai produk atau pesanan tidak bisa dihapus, hanya disembunyikan.
- Definisi satuan di `config/shop.units`, contoh:
  ```ts
  { code: 'kg', label: 'kg', baseLabel: 'gram', factor: 1000, decimals: 2, step: 0.1 }
  { code: 'ekor', label: 'ekor', factor: 1, decimals: 0, step: 1 }
  ```
- Produk yang dijual per berat: harga per satuan (Rp25.000/kg), kasir mengetik berat, total = `round(harga × berat)`. Pembulatan rupiah ada di **satu fungsi** yang dites.

### 3.5 Multi-cabang

- `branches/{branchId}`: nama, kode pendek (`TKL`, `PKM`), alamat untuk struk, aktif/arsip.
- **Stok per cabang**: satu dokumen per cabang, `inventory/{branchId}`, berisi map `levels: { [stockItemId]: number }`. Satu dokumen supaya hemat read (satu listener per cabang), dan `increment('levels.<id>')` tetap aman untuk dua kasir bersamaan.
- Setiap pesanan membawa `branchId`. Laporan bisa per cabang atau gabungan (pemilik).
- Perangkat kasir memilih cabang **sekali saat setup**, disimpan di localStorage, dan dikunci oleh claim staf (lihat 3.7).

### 3.6 Nomor pesanan aman untuk banyak perangkat

- Di Haoshii dua perangkat bisa menghasilkan nomor yang sama (risiko yang diterima karena hanya satu HP kasir). Di sini dua cabang = minimal dua perangkat, jadi wajib aman.
- Format simpan: `YYYYMMDD-<kodeCabang><hurufPerangkat><NNNN>`, contoh `20261124-TKLA0042`.
- Tampil di layar dan struk: `A0042` (atau `TKL-A0042` di laporan gabungan).
- Huruf perangkat dibagikan saat setup perangkat dan disimpan di localStorage. Lihat commit `9e932f8` di Haoshii (fitur ini pernah dibuat lalu di-revert) sebagai titik awal.
- Urutan dihitung offline dari pesanan di memori **per cabang + perangkat**, tidak pernah lewat dokumen counter (counter butuh server dan merusak checkout offline).

### 3.7 Auth dan peran

- Login username + kata sandi, dipetakan ke `<username>@<slug>.local`. `USERNAME_DOMAIN` dibaca dari `client.json`, bukan konstanta.
- Custom claims:
  - `admin: true` boleh pakai aplikasi
  - `role: 'owner' | 'staff'`
  - `branchId` (wajib untuk staf, kosong untuk pemilik). Staf hanya bisa menulis pesanan dan stok cabangnya sendiri, **ditegakkan di rules**.
- Tidak ada `tenantId` dulu (satu project per klien), tapi helper claims ditulis supaya menambahkannya nanti mudah.
- Akun dibuat dengan script `set-admin` (port dari Haoshii, ditambah `--branch`). Halaman Akun di aplikasi menyusul (Worker sudah ada polanya di Haoshii).

### 3.8 Branding dan struk

- `config/shop`: `name`, `logoUrl`, `brandColor`, `accentColor`, `receipt.header[]`, `receipt.footer[]`, `receipt.showCustomerName`, dll.
- Warna masuk ke CSS variable saat runtime (Tailwind v4 `@theme` memakai `var(--color-brand)`).
- Header struk per cabang bisa menimpa header toko (alamat beda).
- Layout struk tetap satu sumber (`buildReceiptLines` di Haoshii), diparameterkan oleh config.

### 3.9 Gambar produk dan logo di R2

- Spark tidak punya Storage, jadi gambar produk diunggah pemilik lewat **satu Worker bersama untuk semua klien**.
- Key: `<slug>/products/<productId>.jpg`, `<slug>/brand/logo.png`.
- Worker memverifikasi Firebase ID token terhadap project id klien (Worker punya map `projectId → slug` di env), lalu hanya mengizinkan akses ke prefix slug itu.
- Bukti transfer: `<slug>/proofs/<orderNumber>_<orderId>.jpg` (pola Haoshii).
- Gambar dikompres di browser (≤800px untuk produk), dan `products.image` hanya menyimpan key, bukan bytes.

### 3.10 Fitur on/off

Port `settings/features` dari Haoshii, ditambah:
- `multiBranch` (sembunyikan pemilih cabang kalau hanya satu)
- `weightSales` (input berat di kasir)
- `bundles` (produk paket)
- `preorder` (Bayar nanti)
- `customers` (data pelanggan dan No. HP)
- `kitchenTicket` (struk dapur)

Default ada di kode, bisa diubah pemilik di Pengaturan → Fitur.

---

## 4. Model data (draf TypeScript)

```ts
// config/shop
interface ShopConfig {
  name: string;
  logoUrl?: string;
  brandColor: string;
  units: Unit[];
  receipt: { header: string[]; footer: string[]; showCustomerName: boolean };
  currency: 'IDR';
  timezone: 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura';
  updatedBy: string; updatedAt: string;
}

interface Unit {
  code: string;        // 'kg', 'ekor', 'pcs', 'pasang'
  label: string;
  factor: number;      // 1000 untuk kg (disimpan gram)
  decimals: number;    // angka di belakang koma saat tampil/input
  step: number;        // langkah input di kasir
}

// branches/{id}
interface Branch {
  id: string; name: string; code: string;  // 'TKL'
  receiptHeader?: string[];
  active: boolean; order: number;
}

// stockItems/{id}
interface StockItem {
  id: string; name: string;
  unit: string;          // kode Unit
  lowAt?: number;        // satuan dasar, untuk tanda "menipis"
  active: boolean; order: number;
}

// inventory/{branchId}
interface BranchInventory {
  levels: Record<string, number>; // stockItemId -> jumlah dalam satuan dasar
}

// products/{id}
interface Product {
  id: string; sku?: string; name: string;
  categoryId?: string;   // kategori dibuat pemilik (koleksi `categories`)
  price: number;         // per unit jual (per kg kalau soldBy = 'weight')
  unit: string;          // satuan jual
  soldBy: 'count' | 'weight';
  stockMode: 'own' | 'shared' | 'none';
  consumes?: { stockItemId: string; qty: number }[]; // per 1 unit jual, satuan dasar
  choiceGroups?: ChoiceGroup[];
  freeItems?: { productId: string; qty: number }[];
  branchIds?: string[];  // kosong = dijual di semua cabang
  priceByBranch?: Record<string, number>;
  image?: string;        // key R2
  active: boolean; order: number;
}

interface ChoiceGroup {
  id: string;
  label: string;          // 'Pilih 3 ayam', 'Level pedas'
  min: number; max: number; // 3 dan 3 untuk "pilih tepat 3"
  allowRepeat: boolean;   // boleh 3× opsi yang sama
  options: {
    id: string; label: string;   // 'Ukuran 40K'
    priceDelta?: number;         // tambahan harga, default 0
    consumes?: { stockItemId: string; qty: number }[];
  }[];
}

// categories/{id}
interface Category { id: string; name: string; order: number; active: boolean }

// orders/{id}
interface OrderLine {
  id: string; productId: string; name: string; sku?: string;
  unit: string;
  quantity: number;      // satuan dasar (gram untuk kg)
  price: number;         // harga per unit jual saat terjual
  total: number;
  choices?: { groupId: string; optionId: string; label: string; count: number }[];
  consumed: { stockItemId: string; qty: number }[]; // snapshot, termasuk pilihan dan bonus
  freeItems?: { productId: string; name: string; qty: number }[];
}

interface Order {
  id: string; orderNumber: string; branchId: string; deviceLetter: string;
  items: OrderLine[]; totalAmount: number;
  orderType: 'instant' | 'preorder';
  orderStatus: 'pending' | 'ready' | 'completed' | 'cancelled';
  paymentStatus: 'paid' | 'unpaid';
  paymentMethod?: 'cash' | 'transfer' | 'qris';
  cashReceived?: number; paidAt?: string;
  customerId?: string; customerName?: string; customerContact?: string;
  pickupTime?: string; eventId?: string; eventName?: string;
  paymentProof?: string;
  createdAt: string; createdBy: string;
  updatedAt?: string; updatedBy?: string;
  cancelledAt?: string; cancelledBy?: string;
}

// stockChanges/{id}: hitung stok manual (pola Haoshii), sekarang dengan branchId
// customers, events, cashCounts: port dari Haoshii, cashCounts ditambah branchId
// dan id dokumen menjadi `${branchId}_${YYYY-MM-DD}`
```

---

## 5. Firestore rules: prinsip

- Port gaya Haoshii: **allowlist field** (`hasOnlyAllowedFields`), deny-by-default, `admin` wajib untuk baca dan tulis.
- Field audit (`createdBy`, `updatedBy`, `cancelledBy`) dipatok `== request.auth.token.email`.
- **Staf terikat cabang**: create/update pesanan dan update `inventory/{branchId}` hanya kalau `branchId == request.auth.token.branchId`.
- Port `isStaffOrderUpdate` (staf hanya boleh mengubah status, pembayaran saat belum lunas, dan waktu ambil).
- `inventory/*.levels`: validasi sebagai map. Rules tidak bisa mengecek setiap nilai map, jadi pemeriksaan stok tetap di klien (sama seperti Haoshii, yang sengaja tidak memberi batas bawah).
- `config/shop`, `products`, `stockItems`, `branches`, `settings/*`: hanya pemilik yang boleh menulis.
- Setiap aturan baru wajib punya kasus di `tests/rules/`.

---

## 6. Yang dipindahkan dari Haoshii

### Pindahkan hampir apa adanya (lalu buang hal khusus dimsum)

| Haoshii | Catatan |
|---|---|
| `utils/businessDate.ts` | zona waktu dari `config/shop.timezone` |
| `utils/orderNumber.ts` | tambah kode cabang + huruf perangkat (3.6) |
| `features/data/queuedWrite.ts`, `useWriteStatus`, `outbox.ts`, `writeErrors.ts` | aturan "jangan pernah `await` write Firestore" tetap berlaku |
| `features/print/escpos.ts`, `bluetoothPrinter.ts`, `ReceiptPaper` | header/footer dari config |
| `features/export/csv.ts` | tambah kolom Cabang, Satuan |
| `features/analytics/*` | filter cabang + gabungan |
| `features/customers/*` | pola sinkron delta dan `resolveCustomerForCheckout` |
| `features/cash/*` | per cabang |
| `features/events/*` | tetap, terpisah dari cabang |
| `features/settings/featureFlags.ts`, `FeaturesContext` | tambah flag di 3.10 |
| `features/pwa/appUpdate.ts` | apa adanya, termasuk `isTillBusy` |
| `features/ui/*`, `Drawer`, `ActionMenu`, `SelectMenu`, `SegmentedControl`, `Stepper` | apa adanya |
| `features/proofs/*` + `worker/` | key diberi prefix slug |
| `scripts/backup.mjs`, `restore.mjs`, `set-admin.mjs`, `check-rules.mjs` | baca project dari `--client <slug>` |
| `docs/DESIGN.md` | jadikan design system basis, warna brand jadi variabel |

### Tulis ulang

- `features/inventory/stock.ts` → `features/stock/consumption.ts`: mesin konsumsi generik (bagian 3.3), pure dan dites.
- `types.ts`: model data baru (bagian 4).
- `MenuManager` → editor Produk + editor Item Stok + editor Cabang.
- `PosTab`: input berat, kategori, produk per cabang.
- `App.tsx`: **jangan** salin god component 3100 baris. Pecah sejak awal: router + provider, satu file per tab, handler pesanan di `features/orders/orderActions.ts`.

### Keputusan Haoshii yang wajib dipertahankan

- Seed data hanya dari jawaban server (`!snapshot.metadata.fromCache`).
- `isCheckoutReady` sebelum checkout pertama.
- Customers disinkron delta, bukan listener.
- Query rentang laporan di-latch ke tab laporan, berhalaman, dan Analitik saja yang membaca sampai habis.
- Uang tunai yang diterima selalu diisi kasir (tidak di-prefill), kembalian diturunkan, tidak disimpan.
- `paymentMethod` kosong sampai uang benar-benar diterima.
- Format uang hanya lewat `formatRupiah`/`formatAmount`.
- Semua overlay lewat `Drawer`, Back/Escape lewat `useBackClose`.
- Update aplikasi hanya saat kasir tidak sibuk.

---

## 7. Provisioning klien baru

Target: klien baru siap dalam ±1 jam.

Script `npm run new-client -- <slug>`:
1. Buat folder `clients/<slug>/` dari template.
2. Panduan langkah manual (cetak di terminal): buat project Firebase di console, aktifkan Auth (Email/Password) dan Firestore (`asia-southeast2`), salin web config ke `client.json`.
3. `firebase use --add` dengan alias `<slug>`.
4. Publish rules dan index ke project itu.
5. Seed `config/shop`, `branches`, `units`, `settings/features`, dan (opsional) produk dari `clients/<slug>/seed.json`.
6. Buat akun pemilik lewat `set-admin`.
7. Tambahkan `projectId → slug` ke env Worker.

Deploy:
- `npm run deploy -- --client <slug>`: build dengan `client.json` itu, lalu deploy Hosting ke project tersebut.
- `npm run deploy:all`: loop semua klien, berhenti kalau satu gagal, laporkan ringkasan.
- CI (GitHub Actions): lint + test + test:rules setiap push. Deploy semua klien dari tag rilis (`v*`), bukan dari setiap push ke `main`, karena banyak toko bergantung pada satu kode.
- Backup mingguan per klien (port `backup.yml`, matrix per slug).

---

## 8. Strategi tes

Pure dan dites (Vitest, tanpa Firebase), sama seperti Haoshii, ditambah:
- `consumption.ts`: produk biasa, mode stok sendiri/bersama/tidak dilacak, paket tetap, paket dengan pilihan (min/max, berulang), berat, bonus, batal, Ubah Item (delta dari snapshot), ganti mode stok setelah ada pesanan
- `units.ts`: konversi tampil ↔ satuan dasar, pembulatan, step input
- `pricing.ts`: total per berat dan pembulatan rupiah
- `orderNumber.ts`: kode cabang + huruf perangkat, tidak bentrok antar perangkat
- `branchScope.ts`: filter laporan per cabang dan gabungan
- `stockForecast.ts`: per cabang

Rules suite (emulator): setiap write sebagai setiap peran, termasuk staf cabang A menulis ke cabang B (harus gagal).

Seed emulator: `npm run seed-test -- --client demo` dengan 2 cabang dan ribuan pesanan.

---

## 9. Fase kerja

Setiap fase: kriteria selesai harus terpenuhi dan tiga pengecekan hijau.

### Fase 0: Fondasi (±2-3 hari)
- Repo baru, Vite + React + TS + Tailwind v4 + PWA + Vitest + emulator.
- Struktur folder, `src/data/paths.ts`, `clients/demo/`.
- `CLAUDE.md` baru (arsitektur, alur kerja, istilah), `docs/` dari Haoshii yang relevan.
- CI lint/test/test:rules.
- **Selesai:** aplikasi kosong jalan di emulator dengan config `demo`.

### Fase 1: Config, branding, auth, cabang (±3-4 hari)
- `ShopConfigContext` membaca `config/shop`, menerapkan warna dan nama.
- Login, claims `role` + `branchId`, `set-admin --branch`.
- Setup perangkat: pilih cabang + huruf perangkat (pemilik saja yang bisa mengubah).
- Rules dasar + tes.
- **Selesai:** dua akun staf di dua cabang, masing-masing hanya melihat cabangnya di kasir.

### Fase 2: Produk, satuan, stok (±4-5 hari)
- `units.ts`, `consumption.ts`, `pricing.ts` + tes.
- Koleksi `stockItems`, `products`, `inventory/{branchId}`.
- Editor Produk: kategori, satuan, jual per jumlah/berat, mode stok (sendiri/bersama/tidak dilacak), paket tetap atau dengan grup pilihan, harga per cabang.
- Editor Item Stok, Kategori, Satuan, Cabang.
- Pengaturan → Stok per cabang (hitung manual + Riwayat).
- Pemilik bisa mengganti mode stok atau isi paket tanpa merusak pesanan lama.
- **Selesai:** kedua setup di bagian 10 (A dan B) bisa dibuat **dari aplikasi** oleh pemilik, tanpa mengubah kode, dan berpindah dari A ke B di tengah jalan tetap memberi laporan dan stok yang benar.

### Fase 3: Kasir dan checkout (±5-6 hari)
- Port PosTab + usePosState: kategori, stepper, input berat untuk `soldBy: 'weight'`, sheet pilihan untuk produk dengan `choiceGroups` (tombol Tambah aktif setelah jumlah pilihan memenuhi min/max).
- Pemeriksaan stok saat tap dan saat checkout, per cabang.
- Checkout offline, nomor pesanan baru, potong stok lewat `increment` + snapshot `consumed`.
- Bayar nanti, pelanggan, Tunai/Transfer/QRIS (sesuai flag).
- **Selesai:** dua perangkat di dua cabang jualan offline bersamaan, sync tanpa bentrok nomor dan stok benar.

### Fase 4: Pesanan, pembayaran, struk (±3-4 hari)
- Port OrdersTab, OrderDetailModal, CollectPaymentSheet, Ubah Item, batal (stok kembali dari snapshot).
- Struk thermal + browser dengan header per cabang, satuan tampil benar ("1,5 kg").
- **Selesai:** struk iWare 58mm tercetak benar untuk produk berat dan paket.

### Fase 5: Analitik dan ekspor (±3-4 hari)
- Filter cabang (Semua / per cabang), prakiraan stok per cabang.
- CSV dengan kolom Cabang dan Satuan.
- **Selesai:** angka Analitik cocok dengan data seed per cabang dan gabungan.

### Fase 6: Pengaturan lain dan gambar (±3 hari)
- Branding (nama, logo, warna, header/footer struk) dari aplikasi.
- Unggah gambar produk dan logo lewat Worker (prefix slug).
- Fitur on/off.
- **Selesai:** pemilik bisa mengganti logo dan foto produk tanpa deploy.

### Fase 7: Provisioning dan deploy multi-klien (±2-3 hari)
- `new-client`, `deploy --client`, `deploy:all`, backup matrix.
- Dokumentasi `docs/RUNBOOK.md`.
- **Selesai:** klien `demo` dan `aneka-ayam-manado` bisa dibuat dan di-deploy dari nol mengikuti runbook.

### Fase 8: Pilot Aneka Ayam Manado (±1 minggu, paralel dengan pemakaian)
- Seed produk (bagian 10), 2 cabang, akun pemilik + staf.
- Demo, training singkat, uji coba 3-7 hari dengan data percobaan, lalu Reset Data sebelum mulai jualan sungguhan.
- Kumpulkan masukan, perbaiki, baru buka untuk klien berikutnya.

Total kasar: **5-7 minggu kerja sampingan**. Fase 0-4 sudah cukup untuk demo ke klien.

---

## 10. Contoh setup: Aneka Ayam Manado

Ini **contoh data**, bukan aturan di kode. Pemilik memilih (dan bisa mengganti) setup-nya sendiri dari aplikasi. Keduanya dipakai sebagai seed `demo` dan sebagai kasus uji Fase 2.

Cabang: `TKL` Lapak Tikala, `PKM` Lapak Perkamil.

### Setup A: stok total ekor

Item stok:
- `ayam`: Ayam utuh, satuan ekor
- `hati`: Hati ayam, satuan pasang
- `kaki`: Kaki ayam, satuan kg (disimpan gram)

Produk (semua ukuran memakai stok bersama `ayam`, paket isi tetap):

| SKU | Nama | Kategori | Satuan | Harga | Consumes |
|---|---|---|---|---|---|
| AS001 | Ayam Segar 35K | Ayam Segar Satuan | ekor | 35.000 | ayam 1 |
| AS002 | Ayam Segar 40K | Ayam Segar Satuan | ekor | 40.000 | ayam 1 |
| AS003 | Ayam Segar 45K | Ayam Segar Satuan | ekor | 45.000 | ayam 1 |
| AS004 | Ayam Segar 50K | Ayam Segar Satuan | ekor | 50.000 | ayam 1 |
| AS005 | Ayam Segar 55K | Ayam Segar Satuan | ekor | 55.000 | ayam 1 |
| | Paket Hemat 100K | Paket Ayam Hemat | paket (3 ekor) | 100.000 | ayam 3 |
| | Paket Hemat 110K | Paket Ayam Hemat | paket (3 ekor) | 110.000 | ayam 3 |
| | Paket Hemat 120K | Paket Ayam Hemat | paket (3 ekor) | 120.000 | ayam 3 |
| | Paket Hemat 130K | Paket Ayam Hemat | paket (3 ekor) | 130.000 | ayam 3 |
| | Paket Hemat 150K | Paket Ayam Hemat | paket (3 ekor) | 150.000 | ayam 3 |
| | Hati Ayam | Produk Tambahan | pasang | 2.500 | hati 1 |
| | Kaki Ayam | Produk Tambahan | kg (per berat) | 25.000/kg | kaki = berat |

### Setup B: stok per ukuran, paket dipilih saat jual

- Ayam Segar 35K-55K memakai mode **stok sendiri**, jadi ada 5 item stok (`ayam35` ... `ayam55`).
- Setiap Paket Hemat punya grup pilihan "Pilih 3 ayam" (min 3, max 3, boleh berulang) dengan opsi ukuran 35K-55K, masing-masing memotong item stok ukurannya.
- Hati dan kaki sama dengan Setup A.

Pindah dari A ke B (atau sebaliknya) dilakukan pemilik dari editor Produk. Kode tidak berubah.

---

## 11. Pertanyaan untuk onboarding klien

Bukan penghalang development. Jawabannya dipakai untuk mengisi setup awal klien (atau pemilik mengisinya sendiri):

1. Stok ayam dihitung per ukuran/kelas harga, atau total ekor saja?
2. Paket hemat berisi ayam ukuran apa? Selalu sama, atau dipilih saat jual?
3. Kaki ayam selalu ditimbang? Ada timbangan digital (nanti bisa dipertimbangkan integrasi)?
4. Harga sama di kedua cabang?
5. Berapa perangkat kasir per cabang?
6. Perlu cetak struk? Printer apa?
7. Metode bayar: tunai, transfer, QRIS?
8. Ada pesanan dibayar nanti/diambil nanti?
9. Siapa yang boleh lihat laporan: pemilik saja, atau kepala cabang juga? (Kalau iya, perlu peran `manager` terikat cabang.)

---

## 12. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Scope melebar karena "semua bisa dicustom" | Batasan di bagian 2. Fitur baru hanya kalau ada klien yang bayar |
| Pengaturan terlalu rumit untuk pemilik UMKM | Nilai awal yang masuk akal, template setup per jenis usaha (dimsum, ayam segar, kedai minuman), opsi lanjutan disembunyikan di "Lanjutan" |
| Satu bug di basis merusak semua klien | Deploy lewat tag rilis, uji di klien `demo` dulu, deploy bertahap |
| Kuota Spark habis di klien ramai | Pertahankan aturan `docs/QUOTA.md`, tambah ringkasan harian untuk analitik bila perlu, opsi pindah ke Blaze per klien |
| Dua perangkat bentrok nomor/stok | Bagian 3.5 dan 3.6, dites di Fase 3 |
| Waktu terbatas (kerja fulltime) | Fase 0-4 dulu untuk demo, sisanya menyusul setelah klien deal |
| Migrasi Haoshii ke basis baru | Belakangan, setelah basis stabil. Butuh script migrasi `Inventory` lama → `stockItems` + `inventory/{branchId}` |
