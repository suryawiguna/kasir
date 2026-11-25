# Rencana: data tahan skala dan filter pesanan

Status: **draf, menunggu persetujuan.** Belum ada kode yang diubah.

Dokumen ini melengkapi [PLAN.md](PLAN.md) (fase 4–5). Tujuannya: aplikasi tetap benar dan tetap di dalam kuota Spark walaupun pesanan sudah ratusan ribu, cabang puluhan, dan katalog ribuan barang.

Catatan jujur: tidak ada sistem yang bebas dari semua kesalahan. Targetnya, **setiap kesalahan yang bisa kita bayangkan punya pengaman**: dicegah rules, ditangkap tes, terlihat di layar, atau terdeteksi script rekonsiliasi. Bagian 12 merangkum pengaman per risiko.

---

## 1. Masalah yang diperbaiki

| # | Masalah sekarang | Akibat |
|---|---|---|
| M1 | Daftar pesanan, hitungan "Belum bayar"/"Diproses", dan pencarian hanya dari 100 pesanan terakhir | Pesanan belum bayar dari pagi hilang sore hari. Hitungan salah. "Semua cabang" hanya menampilkan menit-menit terakhir. |
| M2 | Nomor urut dari 100 pesanan di memori + localStorage. Huruf perangkat hanya diperingatkan, tidak dikunci. | Nomor kembar setelah data browser terhapus, HP diganti, atau dua perangkat memakai huruf sama. |
| M3 | Rules tidak memeriksa isi `orderNumber` | Klien versi lama atau bug bisa menulis nomor yang tidak cocok dengan cabang/perangkat. |
| M4 | Semua field pesanan ikut diindeks, termasuk `items` | Penyimpanan 1 GiB Spark penuh lebih cepat, tulis lebih mahal. |
| M5 | Katalog dimuat penuh lewat listener di setiap buka/bangun | Katalog ribuan barang menghabiskan 50.000 baca per hari. |
| M6 | Analitik belum dirancang | Kalau dibuat dengan membaca semua pesanan, laporan sebulan bisa puluhan ribu baca sekali buka. |

---

## 2. Prinsip

1. **Daftar yang harus lengkap tidak boleh berasal dari jendela terbatas.** Pesanan yang masih diproses dan yang belum dibayar punya query sendiri, tanpa batas tanggal.
2. **Field untuk query disimpan saat pesanan dibuat, tidak pernah berubah, dan dijaga rules.** Kode tidak boleh mem-parsing `orderNumber` untuk filter atau laporan.
3. **Setiap query punya `limit`, halaman, dan hanya aktif saat layarnya terbuka.** Tidak ada query yang ukurannya ikut tumbuh dengan umur toko.
4. **Semua bentuk query ada di satu modul** ([src/data/orderQueries.ts](../src/data/orderQueries.ts), baru). Setiap bentuk punya indeks di `firestore.indexes.json`, dan `npm run lint` mengecek kecocokannya. Emulator tidak menegakkan indeks, jadi tanpa cek ini indeks yang lupa baru ketahuan di produksi.
5. **Filter server hanya yang punya indeks.** Filter lain berlaku di klien atas data yang sudah dimuat, dan layar menyebutkannya.
6. **Angka agregat ditulis dalam batch yang sama dengan pesanan,** dihitung oleh satu modul murni yang dites, dan bisa dicocokkan ulang dengan script.
7. **Setiap perubahan biaya baca dicatat di `docs/QUOTA.md`** (baru, pola Haoshii).
8. **Rules berubah dua tahap.** Perangkat dengan versi aplikasi lama tetap bisa menyimpan pesanan sampai semuanya sudah update (bagian 10).

---

## 3. Perubahan model data

### 3.1 Pesanan: dua field baru

| Field | Isi | Untuk |
|---|---|---|
| `businessDate` | `"YYYY-MM-DD"` di zona toko, dari `createdAt` | Filter tanggal, ringkasan harian, Ekspor. Tidak berubah walau zona toko diganti kemudian. |
| `sequence` | integer, urutan di nomor pesanan | Pencarian nomor pendek (`A0042`) langsung ke server, dan mencari urutan terakhir perangkat |

Rules memeriksa (tanpa `get()`, jadi tanpa biaya baca tambahan):
- `businessDate` cocok dengan pola tanggal dan sama dengan 8 digit awal `orderNumber`.
- `orderNumber` cocok dengan `^\d{8}-[A-Z0-9]{2,6}<deviceLetter>\d{4,}$`.
- `int(<digit akhir orderNumber>) == sequence`.
- Keduanya masuk `keepsIdentity` (tidak bisa diubah).

Yang sengaja **tidak** dicek di rules:
- **`businessDate` terhadap waktu server.** Pesanan offline bisa tersinkron berhari-hari kemudian, jadi cek itu akan menolak penjualan yang sah.
- **Kode cabang di nomor terhadap dokumen cabang.** Cek itu butuh `get()`, artinya 1 baca tambahan per tulis. Kode cabang dijaga TypeScript dan dicek script rekonsiliasi.

### 3.2 Registri perangkat: `devices/{branchId}_{letter}`

```ts
interface Device {
  id: string;              // `${branchId}_${letter}`
  branchId: string;
  letter: string;          // A–Z
  deviceId: string;        // acak, dibuat sekali di localStorage perangkat
  label: string;           // "HP kasir depan", diisi saat setup
  claimedBy: string;       // email
  claimedAt: string;
  lastSeenAt: string;      // diperbarui saat buka aplikasi, maksimal 1x per jam
  appVersion: string;      // untuk tahu kapan rules ketat boleh dipasang
}
```

Lihat bagian 6 untuk alurnya.

### 3.3 Ringkasan harian: `dailySummaries/{branchId}_{YYYYMMDD}`

```ts
interface DailySummary {
  branchId: string;
  businessDate: string;
  // Penjualan, menurut hari pesanan dibuat. Pesanan batal tidak dihitung.
  orderCount: number;
  grossAmount: number;
  byProduct: Record<string, { qty: number; amount: number }>;  // qty dalam satuan dasar
  byHour: Record<string, { count: number; amount: number }>;  // "00".."23"
  byOrderType: Record<OrderType, { count: number; amount: number }>;
  cancelledCount: number;
  cancelledAmount: number;
  // Uang diterima, menurut hari uangnya masuk (bisa beda dengan hari pesanan).
  collectedByMethod: Record<PaymentMethod, number>;
  updatedAt: string;
}
```

Semua angka diubah dengan `increment()` dalam `writeBatch` yang sama dengan pesanan, persis seperti `inventory`. Lihat bagian 7.

### 3.4 Indeks yang dimatikan (`fieldOverrides`)

Field yang tidak pernah dipakai untuk query dikeluarkan dari indeks otomatis:
- `orders.items`, `orders.paymentProof`, `orders.customerContact`
- `inventory.levels`
- `dailySummaries.byProduct`, `byHour`, `byOrderType`, `collectedByMethod`
- `products.choiceGroups`, `consumes`, `freeItems`, `priceByBranch`

Ini menghemat penyimpanan (indeks ikut dihitung dalam 1 GiB) dan mencegah batas 40.000 entri indeks per dokumen tercapai di `inventory` dan `dailySummaries` untuk katalog besar.

---

## 4. Query dan listener

Semua di `src/data/orderQueries.ts`. `npm run lint` menolak `query(shopCol("orders")` di file lain, sama seperti cek `collection(db` sekarang.

| Nama | Bentuk | Jenis | Aktif saat | Batas |
|---|---|---|---|---|
| `openOrders` | `branchId ==` (kecuali pemilik "Semua"), `orderStatus in [pending, ready]`, urut `createdAt` | listener | aplikasi terbuka | 300, plus peringatan kalau tercapai |
| `owedOrders` | `branchId ==`, `paymentStatus == unpaid`, `orderStatus in [pending, ready, completed]`, urut `createdAt` | listener | aplikasi terbuka | 300, plus peringatan |
| `orderHistory` | lihat bagian 5 | halaman pertama listener, halaman berikutnya `getDocs` | tab Pesanan terbuka | 50 per halaman |
| `orderBySequence` | `branchId ==`, `deviceLetter ==`, `sequence ==` | `getDocs`, lalu listener 1 dokumen selama tampil | mencari nomor | 1 |
| `orderByFullNumber` | `orderNumber ==` | `getDocs` | mencari nomor lengkap | 1 |
| `lastSequenceOfDevice` | `branchId ==`, `deviceLetter ==`, urut `sequence desc` | `getDocsFromServer` | setup perangkat | 1 |
| `orderDetail` | dokumen tunggal | listener | detail terbuka | 1 |

Perubahan di [BranchContext.tsx](../src/features/orders/BranchContext.tsx):
- Listener 100 pesanan dihapus. Kasir tidak butuh daftar pesanan untuk berjualan setelah nomor urut tidak lagi dihitung dari memori (bagian 6).
- Diganti `openOrders` dan `owedOrders`. Hitungan "Diproses" dan "Belum bayar" diambil dari sini, jadi selalu lengkap.
- `isCheckoutReady` menunggu `inventory`, registri perangkat, dan urutan terakhir yang sudah diketahui.

**Pergantian hari:** query yang bergantung pada "hari ini" berlangganan ulang di batas tengah malam zona toko. Penjadwalnya dihitung oleh fungsi murni `msUntilNextBusinessDay` yang dites. Tanpa ini, tablet yang menyala semalaman tetap menampilkan pesanan kemarin sebagai "Hari ini".

---

## 5. Filter di tab Pesanan

### 5.1 Filter yang tersedia

| Filter | Pilihan | Tempat |
|---|---|---|
| Cabang (pemilik) | Semua cabang, per cabang | server |
| Tanggal | Hari ini, Kemarin, 7 hari terakhir, Bulan ini, Bulan lalu, Pilih tanggal | server (`businessDate`) |
| Status | Semua, Diproses, Siap, Selesai, Batal | server, sebagai filter utama |
| Pembayaran | Semua, Lunas, Belum bayar | server, sebagai filter utama |
| Metode bayar | Tunai, Transfer, QRIS (sesuai fitur aktif) | server, sebagai filter utama |
| Jenis | Langsung, Pesanan (preorder) | server, sebagai filter utama |
| Pelanggan (bila fitur pelanggan aktif) | pilih dari daftar pelanggan | server (`customerId`), sebagai filter utama |
| Kasir | akun pembuat | klien |
| Cari | nomor pesanan (pendek atau lengkap), nama pelanggan | nomor: server. Nama: klien atas data yang sudah dimuat. |

Tanggal awal selalu **Hari ini**. Rentang yang boleh dipilih staf diatur pemilik di Pengaturan (`staffOrderRanges` di `config/shop`), defaultnya **Hari ini saja**. Pemilik bisa menambah Kemarin, 7 hari, dan seterusnya. Batas ini juga berlaku di pencarian nomor: staf tidak bisa membuka pesanan di luar rentangnya, kecuali yang masih diproses atau belum dibayar, karena itu memang pekerjaan kasir. Ini batas di aplikasi, bukan di rules: rules tetap mengizinkan staf membaca semua pesanan cabangnya, karena membatasi tanggal di rules akan menolak pesanan offline yang tersinkron terlambat.

### 5.2 Cara filter dijalankan

Firestore butuh indeks gabungan untuk setiap kombinasi filter. Supaya jumlah indeks tetap kecil dan pasti:

```
[branchId ==]  +  [satu filter utama]  +  businessDate di antara A..B
urut businessDate desc, createdAt desc, limit 50, startAfter(kursor)
```

- Hanya **satu** filter utama dikirim ke server, dipilih dengan urutan prioritas tetap: pelanggan, pembayaran, status, metode, jenis. Prioritas ditentukan fungsi murni `planOrderQuery(filters)` yang dites. Fungsi ini mengembalikan bentuk query server dan predikat klien untuk sisa filter.
- Filter sisanya diterapkan di klien. Kalau filter klien membuat halaman tampak kosong, pemuat mengambil halaman berikutnya otomatis sampai ada 20 hasil atau sudah 200 pesanan diperiksa. Setelah itu muncul tombol "Muat lebih banyak" dengan keterangan "Dicari di N pesanan".
- Total indeks: (dengan dan tanpa cabang) × (tanpa filter utama + 5 filter utama) = **12 indeks**, ditambah indeks untuk `openOrders`, `owedOrders`, dan pencarian nomor. Masih jauh di bawah batas 200.
- Pilihan filter disimpan di URL (`?tanggal=7h&status=selesai`), jadi tombol Back dan muat ulang tidak menghilangkannya.
- Offline: hasil dari cache ditandai "Dari data di perangkat, mungkin belum lengkap".

### 5.3 Pencarian nomor

- `A0042` → `orderBySequence` di cabang yang dipilih (1 baca). Pemilik di "Semua cabang" bisa mengetik `TKL-A0042`.
- Nomor lengkap `20261124-TKLA0042` → `orderByFullNumber`.
- Hasil yang ditemukan diingat selama sesi, jadi mengetik ulang tidak menambah baca.
- Cara ini lebih sederhana dan lebih murah daripada probe tanggal di Haoshii, karena `sequence` disimpan sebagai field.

---

## 6. Nomor pesanan dan perangkat

### Setup perangkat (wajib online, sekali per HP)

1. Baca `devices` cabang itu dari server (≤26 dokumen). Tampilkan huruf yang terpakai, labelnya, dan kapan terakhir aktif.
2. Pilih huruf kosong, lalu klaim dengan transaksi yang hanya berhasil kalau dokumen belum ada. Transaksi boleh di sini karena setup memang butuh server.
3. Mengambil alih huruf yang sudah dipakai, misalnya HP rusak lalu diganti: **hanya pemilik**, dengan konfirmasi "Perangkat lama tidak akan bisa berjualan lagi". `deviceId` di registri diganti.
4. `lastSequenceOfDevice` dibaca dari server, lalu disimpan di localStorage sebagai titik awal.
5. Kalau offline atau server tidak menjawab, setup ditolak dengan pesan yang jelas. Tidak ada tebakan "mulai dari 0001".

### Saat berjualan

- Urutan berikutnya = `max(localStorage, pesanan perangkat ini yang ada di memori) + 1`. Tidak lagi bergantung pada jendela 100 pesanan.
- Aplikasi mendengarkan dokumen registri perangkatnya sendiri (1 baca per buka). Kalau `deviceId` di registri berbeda, artinya huruf ini diambil alih, maka checkout dikunci dengan pesan "Huruf A sekarang dipakai perangkat lain. Setup ulang perangkat ini."
- Data browser terhapus = setup perangkat hilang juga, jadi perangkat otomatis kembali ke langkah setup dan membaca urutan terakhir dari server.

### Sisa risiko yang tidak bisa dihilangkan

Dua perangkat offline yang sama-sama memakai huruf A, karena satu diambil alih saat yang lain sedang offline, bisa membuat nomor kembar sampai yang lama kembali online. Dampaknya hanya nomor tampilan; dokumen tidak tertimpa karena ID dokumen tetap unik. Script rekonsiliasi melaporkan nomor kembar.

---

## 7. Ringkasan harian (dasar Analitik, Fase 5)

- Modul murni baru **`features/analytics/summaryDelta.ts`**: `summaryDelta(before: Order | null, after: Order) → Map<docId, increments>`. Dipakai oleh checkout, batal, terima pembayaran, tandai belum bayar, dan Ubah Item. Satu-satunya tempat aritmetika ringkasan, dengan tes untuk setiap transisi.
- Aturan hitung:
  - **Penjualan** masuk ke hari `businessDate` pesanan.
  - **Uang diterima** masuk ke hari `paidAt`. Preorder yang dibayar besok masuk kas besok.
  - **Batal** mengurangi penjualan di hari pesanan, menambah `cancelledCount`.
  - **Tandai belum bayar** mengurangi kas di hari `paidAt` lama.
  - **Ubah Item** = delta dari snapshot `consumed`/total lama ke yang baru.
- Biaya per checkout menjadi 3 tulis (pesanan + stok + ringkasan). Dengan batas 20.000 tulis per hari, itu sekitar 6.000 pesanan per hari per klien.
- Analitik membaca ringkasan, bukan pesanan. Sebulan untuk 10 cabang = 300 baca, bukan puluhan ribu.
- **`npm run reconcile -- --client <slug> --from <tgl> --to <tgl> [--fix]`**: menghitung ulang ringkasan dari pesanan, melaporkan selisih, nomor kembar, dan pesanan yang kode cabangnya tidak cocok. `--fix` menulis ulang ringkasan. Biaya baca = jumlah pesanan dalam rentang, dan dicetak sebelum jalan.
- Batas yang diakui: rules tidak bisa memastikan isi increment benar. Staf yang berniat curang bisa mengubah ringkasan cabangnya. Rules membatasi siapa dan field apa, rekonsiliasi mendeteksi selisihnya.

---

## 8. Katalog besar

Untuk katalog sampai sekitar 300 produk + item stok, listener sekarang tetap dipakai. Di atas itu, wajib diganti sebelum klien seperti itu dipakai:

- `products`, `stockItems`, `categories` mendapat `updatedAt` wajib (dijaga rules) dan **hapus menjadi arsip** (`archived: true`), karena sinkron delta tidak bisa melihat dokumen yang dihapus.
- Sinkron delta pola `customers` Haoshii: baca cache dulu, lalu `where updatedAt > terakhir-sinkron - 24 jam`, didahului `getCountFromServer` untuk mendeteksi penghapusan langsung di database.
- Kasir: kolom cari produk dan daftar tervirtualisasi saat produk lebih dari 200.
- Batas buatan sendiri dilonggarkan: `branchIds ≤ 50` menjadi ≤ 200.

Batasnya dicek dari data, bukan dari nama klien: Pengaturan menampilkan peringatan saat katalog melewati ambang.

---

## 9. Penyimpanan dan arsip

- Perkiraan setelah `fieldOverrides`: sekitar 1,5–2,5 KB per pesanan termasuk indeks. Hitungan pastinya diukur di emulator saat implementasi dan dicatat di QUOTA.md.
- Dengan 600 pesanan per hari, 1 GiB cukup untuk sekitar 2–3 tahun.
- `npm run archive -- --client <slug> --before <tgl> [--delete]`: Ekspor pesanan lama ke file JSONL + CSV (masuk backup), lalu opsional dihapus dengan Admin SDK. Ringkasan harian tidak ikut dihapus, jadi Analitik tetap jalan. Penghapusan hanya lewat script, tidak dari aplikasi, dan butuh konfirmasi.
- Alternatifnya pindah ke Blaze untuk klien itu. QUOTA.md memuat ambang kapan ini disarankan.

---

## 10. Migrasi dan urutan rilis

Urutan ini penting. Kalau rules ketat dipasang lebih dulu, pesanan offline dari perangkat versi lama akan ditolak dan hilang.

1. **Deploy indeks** dan tunggu sampai semua berstatus siap. Query yang indeksnya belum jadi akan gagal.
2. **Deploy rules transisi**: `businessDate`, `sequence`, dan dokumen ringkasan boleh tidak ada. Kalau ada, harus konsisten.
3. **`npm run migrate -- --client <slug> [--dry-run]`**: mengisi `businessDate` dan `sequence` di pesanan lama, membuat registri perangkat dari huruf yang pernah dipakai, lalu membangun ringkasan dari riwayat. Idempoten, jadi boleh dijalankan ulang.
4. **Deploy aplikasi baru.**
5. **Rules ketat** setelah semua perangkat di registri melapor `appVersion` baru. Script `deploy` menolak memasang rules ketat sebelum itu.

Untuk `kasir-demo`: migrate, lalu `seed --force` seperti biasa. Untuk `demo` (emulator): seed ulang saja.

---

## 11. Tes

**Modul murni (Vitest)**
- `planOrderQuery`: setiap kombinasi filter → bentuk query server + predikat klien. Tes kalau prioritas berubah.
- `summaryDelta`: buat, batal, bayar, bayar beda hari, tandai belum bayar, Ubah Item, batal setelah bayar, pesanan tanpa `businessDate` (data lama).
- `nextSequence` versi baru: localStorage kosong, memori lebih tinggi, angka dari server.
- `msUntilNextBusinessDay` untuk ketiga zona waktu Indonesia.
- Parsing `businessDate`/`sequence` dari nomor (dipakai migrate dan reconcile).

**Rules (emulator)** — setiap aturan baru punya kasus:
- Pesanan: `businessDate` tidak cocok nomor, `sequence` tidak cocok, huruf di nomor tidak cocok `deviceLetter`, mengubah `businessDate`/`sequence` setelah dibuat.
- Registri: staf mengklaim huruf kosong di cabangnya (boleh), di cabang lain (tolak), mengambil alih (tolak), pemilik mengambil alih (boleh), memperbarui `lastSeenAt` milik sendiri (boleh).
- Ringkasan: staf cabang lain (tolak), field asing (tolak), menghapus (tolak).
- Rules transisi vs ketat: keduanya dites.

**Cek statis**
- `scripts/check-indexes.mjs` (masuk `npm run lint`): setiap bentuk di `orderQueries.ts` punya indeks yang cocok.
- `scripts/check-paths.mjs` diperluas: query pesanan hanya di `orderQueries.ts`.

**Uji di browser** (emulator, `npm run dev`): seed 5.000 pesanan sintetis di 3 cabang selama 60 hari, lalu cek setiap filter, pencarian nomor, pergantian hari, dan hitungan "Belum bayar" untuk pesanan berumur 30 hari.

---

## 12. Ringkasan pengaman per risiko

| Risiko | Pengaman |
|---|---|
| Pesanan belum bayar tidak terlihat | query `owedOrders` tanpa batas tanggal, plus peringatan kalau mendekati batas |
| Nomor kembar | registri perangkat + urutan dari server + deteksi di rekonsiliasi |
| Nomor tidak cocok dengan cabang/perangkat | rules (pola + `sequence`) + rekonsiliasi (kode cabang) |
| Indeks lupa dibuat | `check-indexes.mjs` di lint |
| Laporan tidak cocok dengan pesanan | satu modul `summaryDelta` + batch atomik + `reconcile` |
| Kuota baca habis | semua query terbatas dan terhalaman, katalog delta, QUOTA.md, peringatan ambang katalog |
| Penyimpanan penuh | `fieldOverrides`, `archive`, ambang Blaze |
| Perangkat versi lama ditolak rules | rules dua tahap + `appVersion` di registri |
| Tablet semalaman menampilkan hari kemarin | berlangganan ulang di batas hari |
| Filter hilang saat Back/muat ulang | filter di URL |

---

## 13. Fase kerja

Setiap fase berakhir dengan `npm run lint`, `npm test`, `npm run test:rules` hijau, lalu laporan dan persetujuan sebelum commit.

| Fase | Isi | Selesai bila |
|---|---|---|
| **D1. Fondasi** | field `businessDate`/`sequence`, rules transisi + tes, `fieldOverrides`, `orderQueries.ts`, `check-indexes.mjs`, `migrate` | pesanan baru menyimpan dua field itu, migrate jalan di emulator |
| **D2. Pesanan lengkap** | `openOrders`/`owedOrders` menggantikan jendela 100, filter + halaman + URL, pencarian nomor server, pergantian hari | uji 5.000 pesanan lolos, hitungan "Belum bayar" benar untuk pesanan lama |
| **D3. Perangkat** | registri, klaim/ambil alih, urutan dari server, kunci checkout | hapus data browser → setup ulang → nomor lanjut tanpa kembar |
| **D4. Ringkasan** | `summaryDelta` + tes, tulis di semua handler, `reconcile` | reconcile di data uji: 0 selisih |
| **D5. Kuota** | `docs/QUOTA.md` dengan hitungan per aksi, penghitung baca di mode dev | angka dokumen cocok dengan penghitung |
| **D6. Katalog besar** | `updatedAt` + arsip, sinkron delta, cari + virtualisasi | 3.000 produk: buka aplikasi ≤ 50 baca setelah sinkron pertama |
| **D7. Rules ketat** | pasang setelah semua perangkat update | tes rules ketat hijau, deploy menolak bila ada perangkat lama |
| **D8. Arsip** (bila perlu) | `archive` | Ekspor + hapus di emulator, Analitik tetap benar |

D1–D4 sebaiknya selesai sebelum Fase 5 (Analitik). D6 dan D8 dikerjakan saat ada klien yang membutuhkannya.

---

## 14. Perkiraan baca per hari

Contoh Aneka Ayam setelah D1–D5: 2 cabang, 150 pesanan per cabang per hari, 2 HP per cabang + 1 HP pemilik. Masing-masing dihitung 2 kali muat dan 4 kali bangun dari tidur lebih dari 30 menit.

| Bagian | Baca |
|---|---|
| Buka/bangun: config, fitur, cabang, katalog ±50, stok 1, registri 1, `openOrders` ±10, `owedOrders` ±10 → ±75 × 6 × 5 perangkat | 2.250 |
| Tab Pesanan, halaman pertama Hari ini: 50 × 4 kunjungan × 5 perangkat | 1.000 |
| Perubahan realtime: 300 pesanan × ±3 perubahan × ±3 perangkat yang mendengarkan | 2.700 |
| Analitik pemilik: ringkasan 30 hari × 2 cabang × 3 kunjungan | 180 |
| **Total** | **±6.100 (12% kuota)** |

Angka ini tidak naik dengan umur toko. Yang menaikkannya hanya jumlah pesanan per hari dan jumlah perangkat.

---

## 15. Keputusan

Sudah diputuskan (2026-11-25):
1. Rentang tanggal staf: default **Hari ini saja**, bisa diperluas pemilik.
2. Laporan: **penjualan di hari pesanan dibuat, kas di hari uang diterima**. Keduanya disimpan di ringkasan harian.

Belum diputuskan:
3. **Urutan fase:** D1 → D2 → D3 → D4 lalu Fase 5. Atau D3 (perangkat) didahulukan karena risiko nomor kembar?
