# Rencana: foto menu dan logo lewat unggah ke R2

Status: **G1–G3 selesai di kode dan teruji lokal** (emulator + `wrangler dev`). G4 (deploy kasir-demo) menunggu `wrangler login` dan persetujuan. G5 belum.

Ini rincian PLAN.md §3.9 dan Fase 6 (unggah gambar). Pertama dipakai di **`kasir-demo`**. Klien lain tinggal menyalakannya lewat konfigurasi.

---

## 1. Ruang lingkup

**Masuk:**
- Pemilik mengunggah, mengganti, dan menghapus foto produk dari Pengaturan → Produk. Di HP, kamera bisa dipakai langsung.
- Pemilik mengganti logo toko dengan unggahan dari Pengaturan → Toko. Kolom teks "URL logo" dihapus.
- Foto tampil di Kasir (bisa dimatikan pemilik) dan logo tampil di layar masuk serta shell. Keduanya tetap tampil saat offline setelah pernah dimuat.

**Belum:**
- Logo di struk thermal (butuh konversi bitmap ESC/POS, pekerjaan terpisah).
- Ikon PWA dari logo unggahan. Ikon PWA ditentukan saat build, bukan runtime.
- Bukti transfer (`proofPhotos`). Worker-nya disiapkan supaya bisa ditambah nanti, tapi tidak dikerjakan sekarang.

---

## 2. Prinsip

1. **Menyala lewat konfigurasi, bukan nama klien.** Fitur unggah muncul bila `clients/<slug>/client.json` punya `workerUrl`. Untuk sekarang hanya `kasir-demo` yang diisi. Tidak ada `if (slug === "kasir-demo")`.
2. **Aplikasi tidak pernah memegang kredensial R2.** Semua yang dikirim ke HP itu publik. Unggah lewat Worker yang memeriksa Firebase ID token, pola Haoshii.
3. **Satu bucket R2 per klien, satu Worker untuk semua.** Bucket diberi nama sesuai slug (`kasir-demo` untuk demo), sejalan dengan satu project Firebase per klien: data klien tidak bercampur dan aturan hapus otomatis bisa berbeda per klien. Worker `kasir-media` memegang binding ke setiap bucket. Akun Cloudflare sama dengan Haoshii, tapi **Worker dan bucket Haoshii tidak dipakai atau diubah.**
4. **Nama file berdasarkan isi (content-addressed):** `<sha256 16 hex>`. Satu nama = satu isi selamanya, jadi cache boleh "immutable", tidak ada masalah foto lama yang masih tampil, dan unggah ulang aman (idempoten).
5. **Firestore hanya menyimpan key, bukan URL.** URL disusun di satu fungsi dari `workerUrl`. Domain Worker bisa diganti tanpa migrasi data.
6. **Dikompres di browser.** HP kasir di data seluler tidak mengunduh foto 4 MB.
7. **Unggah butuh internet dan boleh di-`await`.** Aturan "jangan await" berlaku untuk tulis Firestore, bukan untuk `fetch` ke Worker. Setelah unggah berhasil, perubahan dokumen produk tetap lewat `queueWrite`.

---

## 3. Bentuk data

| Dokumen | Field | Contoh | Dijaga rules |
|---|---|---|---|
| `products/{id}` | `image` | `products/<productId>/3f9a1c0b7d2e4a55.jpg` | regex `^products/<id dokumen ini>/[0-9a-f]{16}\.jpg$` |
| `config/shop` | `logo` | `brand/logo/9b1e44c2a0f37d18.png` | regex `^brand/logo/[0-9a-f]{16}\.(jpg\|png)$` |

- Thumbnail tidak disimpan terpisah. Namanya diturunkan: `…/3f9a1c0b7d2e4a55-t.jpg`.
- `logoUrl` lama masih dibaca oleh `parseShopConfig` bila `logo` kosong, supaya data lama tidak rusak, tapi tidak bisa diisi lagi dari aplikasi. Rules transisi tetap menerimanya.
- `image` yang sekarang berisi URL bebas (≤300 karakter) diganti regex di atas. Seed belum memakai `image`, jadi tidak ada data yang perlu dimigrasi. Kalau ternyata ada di `kasir-demo`, `seed --force` menimpanya.
- Rules memastikan `image` produk menunjuk folder produk itu sendiri, jadi foto satu produk tidak bisa dipakai produk lain tanpa diunggah.

Di R2, key disimpan apa adanya di bucket klien, misalnya `products/abc123/3f9a1c0b7d2e4a55.jpg` di bucket `kasir-demo`. Untuk unggah, bucket ditentukan Worker dari token, tidak dari permintaan.

---

## 4. Worker `kasir-media` (folder `worker/` di repo ini)

Tanpa dependency, seperti Haoshii: verifikasi token RS256 dengan WebCrypto terhadap kunci publik Google.

### Endpoint

| Metode | Path | Siapa | Isi |
|---|---|---|---|
| `PUT` | `/v1/products/<productId>/<hash>.jpg` dan `…/<hash>-t.jpg` | pemilik | foto produk dan thumbnail |
| `PUT` | `/v1/brand/logo/<hash>.(jpg\|png)` | pemilik | logo |
| `GET` | `/v1/<slug>/<key>` | publik | gambar. Foto menu dan logo bukan data rahasia, dan logo dibutuhkan di layar masuk sebelum login. |
| `OPTIONS` | semua | — | CORS |

### Pemeriksaan PUT, berurutan

1. `Authorization: Bearer <ID token>`: tanda tangan RS256 valid, `exp`/`iat` wajar.
2. `aud` ada di peta klien (`CLIENTS`, env JSON: `projectId → { slug, origins, bucket }`, `bucket` = nama binding R2 di `wrangler.toml`). Dari sini bucket ditentukan. Menambah klien = tambah binding + entri peta, lalu deploy ulang Worker.
3. Claims `admin == true` dan `role == "owner"`.
4. `Origin` ada di daftar origin klien itu.
5. Path cocok regex, `productId` hanya `[A-Za-z0-9_-]{1,100}`, tanpa `..` atau `/` tambahan.
6. Ukuran: foto ≤ 300 KB, thumbnail ≤ 60 KB, logo ≤ 200 KB. Dicek dari `content-length` lalu dari body sebenarnya.
7. Magic bytes sesuai ekstensi (JPEG `FF D8 FF`, PNG `89 50 4E 47`). `Content-Type` disetel Worker, bukan diambil dari permintaan.
8. **SHA-256 body = hash di nama file.** Isi tidak bisa ditukar diam-diam.
9. Sudah ada → `200` tanpa menulis ulang (idempoten). Belum ada → simpan dengan metadata `uploadedBy`, `uploadedAt`.
10. Batas laju per akun (misalnya 60 unggahan per 10 menit) dan per slug per hari. Ketersediaan binding Rate Limiting di paket gratis dicek saat implementasi. Cadangannya penghitung di Workers KV.

### GET

- `Cache-Control: public, max-age=31536000, immutable` dan `Access-Control-Allow-Origin: *`.
- Dilayani dari Cache API Cloudflare dulu, R2 hanya kalau cache kosong. Ini menghemat operasi baca R2.
- Header `X-Content-Type-Options: nosniff`. Hanya `.jpg`/`.png` yang dilayani.

### Biaya dan batas

Paket gratis R2: 10 GB penyimpanan, 1 juta operasi tulis dan 10 juta baca per bulan, egress gratis. Workers gratis: 100.000 permintaan per hari. Cloudflare tidak punya batas pengeluaran, jadi **batas ukuran, laju, dan kuota per slug di Worker itulah pengendali biaya**, sama seperti Haoshii.

---

## 5. Risiko khusus kasir-demo

Kata sandi akun `owner` di kasir-demo dibagikan ke calon klien, jadi **siapa pun bisa mengunggah**. Akibatnya: penyalahgunaan penyimpanan, dan gambar tidak pantas yang terlihat oleh calon klien lain.

Pengaman:
- Semua batas di bagian 4 (ukuran, jenis, laju, kuota harian per slug).
- **Unggahan demo dihapus otomatis setelah 7 hari.** Lifecycle rule di bucket `kasir-demo` untuk prefix `products/` dan `brand/`. Bucket klien sungguhan tidak punya rule ini.
- **Demo dimulai tanpa foto.** Tidak ada foto bawaan. `npm run seed -- --client kasir-demo --force` mengosongkan `image` produk dan `logo`, jadi produk yang fotonya sudah terhapus lifecycle bisa dibersihkan.
- Komponen gambar selalu punya cadangan (huruf awal + warna brand). Foto yang sudah terhapus lifecycle tetapi masih dirujuk produk tampil sebagai cadangan, bukan ikon rusak.

Yang tetap tersisa: selama 7 hari itu, calon klien lain bisa melihat unggahan orang lain. Kalau nanti tidak bisa diterima, unggah di demo bisa dibatasi ke akun pemilik terpisah yang kata sandinya tidak dibagikan.

---

## 6. Sisi aplikasi

### Modul baru `src/features/media/`

| File | Isi | Dites |
|---|---|---|
| `imageKeys.ts` | buat key produk/logo, turunkan key thumbnail, `imageUrl(workerUrl, slug, key)`, validasi pola (regex sama dengan rules) | ya |
| `imageSize.ts` | hitung ukuran tujuan (`fitWithin`, potong persegi untuk thumbnail), pesan galat file (bukan gambar, terlalu besar sebelum kompres, dll.) | ya |
| `compressImage.ts` | `createImageBitmap(file, { imageOrientation: "from-image" })` → canvas → JPEG 0,8 (foto ≤1024px, thumbnail 256px persegi) / PNG bila logo punya transparansi (≤512px), lalu SHA-256 | tidak (butuh DOM), diuji di browser |
| `uploadImage.ts` | `PUT` ke Worker dengan `getIdToken()`, batas waktu 20 detik, coba ulang 2x untuk galat jaringan/5xx, pesan Bahasa Indonesia per kode HTTP | logika coba ulang dan pemetaan pesan dites |

- iPhone: input file `accept="image/*"` sudah mengubah HEIC jadi JPEG. Kalau browser tetap memberi HEIC yang tidak bisa didekode, muncul pesan "Format foto ini belum didukung. Pilih JPG atau PNG."
- Canvas besar di HP murah bisa gagal tanpa pesan. Gambar diperkecil bertahap dan file di atas 25 MB ditolak sebelum didekode.

### Komponen

- **`<ProductImage>`** dan **`<ShopLogo>`** di `src/components/`: `loading="lazy"`, `width`/`height` tetap (layout tidak melompat), cadangan saat kosong/galat/offline belum di-cache. Halaman tidak boleh memakai `<img src={product.image}>` langsung. Ini dicek `check-paths.mjs`.
- **`<ImagePicker>`**: pratinjau, tombol Ganti/Hapus, status "Mengunggah…", tombol nonaktif saat offline dengan keterangan "Butuh internet untuk mengunggah foto". Mengikuti DESIGN.md (class `index.css`, overlay lewat `Drawer`).

### Alur simpan foto produk

1. Pilih foto → kompres → hitung hash → tampilkan pratinjau.
2. Unggah foto dan thumbnail (keduanya harus berhasil).
3. Tulis `image` ke produk lewat `queueWrite`. Kalau tulis ditolak, objek di R2 jadi yatim dan dibersihkan script (bagian 8).
4. Hapus foto = kosongkan `image` saja. Objeknya dibersihkan script nanti, karena perangkat lain mungkin masih menampilkan versi lama dari cache.

Produk baru yang belum disimpan belum punya ID dokumen di server. ID dibuat dengan `newId` saat editor dibuka, jadi foto bisa diunggah sebelum produk disimpan.

### Cache dan offline

- Workbox `runtimeCaching` untuk origin Worker: `CacheFirst`, maksimal 500 entri, 90 hari, hanya status 200. Aman karena nama file berdasarkan isi.
- `brandCache` menyimpan key logo, jadi logo di layar masuk muncul dari cache tanpa menunggu Firestore.

### Saklar fitur

- `productPhotos` di `settings/features`: "Tampilkan foto produk di kasir", default **nyala**. Kasir dengan menu panjang bisa memilih daftar yang lebih rapat.
- Bagian unggah di Pengaturan hanya muncul bila `CLIENT.workerUrl` terisi dan pengguna adalah pemilik.

---

## 7. Rules dan tes

**Rules (dengan kasus di `tests/rules/`):**
- `products.image`: key valid (boleh), folder produk lain (tolak), URL `https://…` (tolak), ekstensi lain (tolak), staf mengubah (tolak, sudah dijamin karena katalog milik pemilik).
- `config/shop.logo`: key valid, pola salah, staf mengubah.
- `logoUrl` lama tetap diterima selama transisi.

**Worker (Vitest di `worker/`):** token kedaluwarsa, `aud` asing, staf, origin asing, path dengan `..`, ukuran berlebih (header bohong vs body), magic bytes salah, hash tidak cocok, unggah ulang idempoten, GET key tidak ada, GET ekstensi aneh.

**Uji di browser (emulator):** `npm run dev` + `wrangler dev` dengan `ACCEPT_EMULATOR_TOKENS=true` (hanya di `.dev.vars`, tidak pernah di Worker yang di-deploy), dan peta klien `demo-kasir`. Cek: unggah dari kamera, foto miring dari HP (EXIF), logo PNG transparan, offline (tombol nonaktif, gambar dari cache), foto terhapus (cadangan tampil).

---

## 8. Script

- `npm run images:prune -- --client <slug> [--dry-run]`: daftar objek di bucket klien, bandingkan dengan semua `image` dan `logo` di Firestore, hapus yang tidak dirujuk dan berumur lebih dari 7 hari. Butuh token API R2 di `worker/.r2.env` (di-gitignore). Untuk kasir-demo, lifecycle sudah menghapus semuanya dalam 7 hari, jadi script ini terutama untuk klien sungguhan.
- `npm run seed`: tidak mengisi foto. Dengan `--force`, mengosongkan `image` dan `logo`.

---

## 9. Langkah operasional kasir-demo

Langkah yang menyentuh akun Cloudflare dan situs publik dikerjakan dengan persetujuanmu di setiap langkah.

1. Kamu menjalankan `npx wrangler login` sendiri (login akun tidak saya lakukan).
2. Buat bucket `kasir-demo` dan deploy Worker `kasir-media` ke subdomain `workers.dev`.
3. Pasang lifecycle rule 7 hari di bucket `kasir-demo` untuk `products/` dan `brand/`.
4. Isi `workerUrl` di `clients/kasir-demo/client.json`.
5. Deploy rules, lalu build dan deploy kasir-demo.
6. Cek di https://kasir-demo.web.app: unggah foto, ganti logo, buka offline.

---

## 10. Fase kerja

Setiap fase berakhir dengan `npm run lint` (termasuk `tsc -p worker`), `npm test` (termasuk tes Worker), `npm run test:rules` hijau, lalu laporan dan persetujuan.

| Fase | Isi | Selesai bila |
|---|---|---|
| **G1. Worker** | `worker/` + tes + dev lokal dengan token emulator | semua tes Worker hijau, unggah dari emulator tersimpan di R2 lokal |
| **G2. Modul klien** | `imageKeys`, `imageSize`, `compressImage`, `uploadImage`, komponen gambar, Workbox cache | tes modul hijau |
| **G3. UI + rules** | `ImagePicker` di Produk dan Toko, saklar `productPhotos`, rules `image`/`logo` + tes | uji browser bagian 7 lolos |
| **G4. kasir-demo** | langkah bagian 9 | foto dan logo bisa diganti di kasir-demo.web.app tanpa deploy |
| **G5. Pembersihan** | `images:prune` | dry-run di kasir-demo menunjukkan objek yatim dengan benar |

Hubungan dengan [DATA-PLAN.md](DATA-PLAN.md): keduanya mengubah `firestore.rules` dan tes rules, jadi **dikerjakan berurutan, tidak bersamaan**. Rencana ini lebih kecil dan bisa duluan.

---

## 11. Keputusan

Sudah diputuskan (2026-11-25):
1. Akun Cloudflare sama dengan Haoshii. Bucket baru `kasir-demo` (satu bucket per klien), Worker baru `kasir-media`.
2. Unggahan demo dihapus otomatis setelah **7 hari**.
3. Demo dimulai **tanpa foto**.

Belum diputuskan:
4. **Urutan:** foto/logo dulu, baru data (D1–D4)? Atau sebaliknya?
