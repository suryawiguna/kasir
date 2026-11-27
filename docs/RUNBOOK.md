# Runbook

## Klien baru dari nol

1. `npm run new-client -- <slug> "<Nama Toko>"`
2. Firebase console, project baru di paket Spark:
   - Authentication → Sign-in method → aktifkan **Email/Password**
   - Firestore → buat database di **asia-southeast2** (Jakarta)
   - Project settings → Your apps → Web → salin config ke `clients/<slug>/client.json`
   - Project settings → Service accounts → Generate new private key → `clients/<slug>/service-account.json` (di-gitignore, jangan di-commit)
3. Publish rules + index:
   ```bash
   npx firebase-tools@15 deploy --only firestore --project <projectId>
   ```
4. Sesuaikan `clients/<slug>/seed.json` (zona waktu! Manado = `Asia/Makassar`), lalu:
   ```bash
   npm run seed -- --client <slug>
   ```
   Tanpa `--force`, dokumen yang sudah ada tidak disentuh.
5. Akun:
   ```bash
   npm run set-admin -- --client <slug> <pemilik> <kata-sandi> owner
   npm run set-admin -- --client <slug> <kasir> <kata-sandi> staff --branch <branchId>
   ```
6. Deploy:
   ```bash
   npm run deploy -- --client <slug>
   ```
7. Di setiap HP kasir: buka URL, masuk, setup perangkat (cabang + huruf berbeda per perangkat), lalu "Tambahkan ke layar utama".

## Mencabut akses

```bash
npm run set-admin -- --client <slug> --revoke <username>
```

## Mengubah rules

1. Edit `firestore.rules`, tambah kasus di `tests/rules/`.
2. `npm run test:rules` hijau.
3. Publish ke setiap klien **sebelum** men-deploy aplikasi yang membutuhkannya:
   `npm run deploy -- --client <slug> --rules`.

## Demo per calon klien (kasir-demo)

Satu project (`kasir-demo`), satu link, demo terpisah per prospek di `demos/{demoId}/`. Prospek membuka link dan langsung masuk ke layar kasir: login anonim otomatis, dianggap pemilik, cabang dan huruf perangkat dipilih otomatis. Akun lama (`owner`, `kasira`, `kasirb`) dan `clients/kasir-demo/seed.json` tidak dipakai lagi; halaman login tidak muncul di build ini.

Semua ini hanya aktif karena `clients/kasir-demo/client.json` berisi `"demo": true`. Klien lain tidak berubah.

### Sekali saja

1. Firebase console `kasir-demo` → Authentication → Sign-in method → aktifkan **Anonymous**.
2. Rules demo (**bukan** `firestore.rules`):
   ```bash
   npm run deploy -- --client kasir-demo --rules
   ```
   Ini memakai `firebase.demo.json` → `firestore.demo.rules`. Jangan `firebase deploy --only firestore --project kasir-demo` langsung: itu mem-publish rules klien biasa dan semua demo berhenti jalan.
3. Demo bawaan di root (`kasir-demo.web.app/`):
   ```bash
   npm run seed-demo -- contoh --template dimsum
   ```
4. Deploy aplikasi: `npm run deploy -- --client kasir-demo`.
5. Opsional: isi `"demoContactUrl": "https://wa.me/62..."` di `clients/kasir-demo/client.json` supaya tombol "Mau pakai untuk toko kakak?" muncul di semua demo (per demo bisa ditimpa dengan `--contact`).

### Per prospek

```bash
npm run seed-demo -- aneka-ayam --template ayam --name "Aneka Ayam Manado" \
  --branches "Lapak Tikala:TKL,Lapak Perkamil:PKM" --color "#ca792a"
# lalu kirim link yang dicetak: https://kasir-demo.web.app/d/aneka-ayam
```

- Template: `dimsum`, `ayam`, `cafe`, `salon` (`clients/kasir-demo/templates/`). Angka stok di template adalah sisa stok sekarang, jadi demo tidak pernah dibuka dengan stok habis.
- `--branches`: nama dipisah koma, kode cabang opsional setelah titik dua (masuk ke nomor pesanan). Tanpa kode, diambil 3 huruf pertama nama.
- Template `ayam` = menu yang dikirim Aneka Ayam Manado sendiri (kode AS001–AS005, Paket Hemat 3 ekor, Hati per pasang, Kaki per kg); warna oranye `#ca792a` dari menu mereka.
- Opsi: `--color "#b45309"`, `--products produk.json` (daftar produk, atau objek berisi `products`/`categories`/`stockItems`/`inventory`), `--orders 30` (hari pesanan contoh, bawaan 30 supaya Laporan 30 hari dan Bulan ini terisi; 0 = tanpa), `--contact "https://wa.me/62..."`.
- Pola pesanan contoh untuk Laporan: akhir pekan ±1,4× hari biasa, jam ramai dari `sampleHours` template (dimsum/cafe sore-malam, ayam pagi, salon siang-sore), cabang pertama lebih ramai (2 cabang ≈ 60/40), dan 1-2 item stok tepat di batas menipis. Laporan 30 hari tidak menampilkan persen pembanding karena 30 hari sebelumnya kosong.
- Id demo: huruf kecil, angka, `-`, 2-40 karakter. Link dengan huruf besar diarahkan ke bentuk kecil.
- `npm run seed-demo -- --list`: daftar demo dan link-nya.
- Reset ke kondisi awal (menghapus pesanan pengunjung juga): ulangi perintah seed dengan `--force`.
- Hapus: `npm run seed-demo -- aneka-ayam --delete`.
- Slug yang belum di-seed menampilkan "Demo ini belum tersedia" dan tidak bisa membuat data (rules memeriksa `demos/{demoId}` ada).
- Unggah foto dan logo mati di demo (Worker butuh token pemilik sungguhan).

### Demo general (satu link untuk banyak lead)

Dipakai saat belum punya menu calon klien, atau untuk dikirim ke banyak lead sekaligus. Untuk lead yang sudah mengirim menunya, buat demo per prospek seperti di atas.

| Link | Untuk | Isi |
|---|---|---|
| `kasir-demo.web.app/d/fnb` | dimsum, cafe, F&B umum | template `dimsum` + Minuman dari `clients/kasir-demo/products/fnb.json`, 2 cabang |
| `kasir-demo.web.app/d/salon` | usaha jasa (nail art, salon) | template `salon`: layanan tanpa stok, cuticle oil dilacak per botol |

Seed (atau seed ulang dengan `--force`, yang juga menghapus pesanan yang dibuat pengunjung):

```bash
npm run seed-demo -- fnb --template dimsum --name "Dimsum & Kopi Contoh" \
  --branches "Cabang 1:CB1,Cabang 2:CB2" \
  --products clients/kasir-demo/products/fnb.json \
  --contact "https://wa.me/6282247973615"

npm run seed-demo -- salon --template salon --name "Nail Studio Contoh" \
  --contact "https://wa.me/6282247973615"
```

- File produk sengaja di `clients/kasir-demo/products/`, bukan `templates/`: setiap file di `templates/` dianggap template.
- `fnb.json` hanya berisi `categories` dan `products`; item stok dan stok awal tetap dari template `dimsum`. Stok minuman tidak dilacak (satuan liter/gram tidak ada di template dimsum).
- Seed ulang sebaiknya rutin (mis. setiap minggu), karena pengunjung bisa membuat atau membatalkan pesanan dan pesanan contoh berhenti di tanggal seed (Laporan "Hari ini" kosong bila demo tidak di-seed ulang).

### Laporan

Tab Laporan (pemilik saja, di demo selalu terlihat) membaca pesanan semua cabang selama tab terbuka. Tidak butuh rules atau indeks baru: query rentang `createdAt`/`paidAt` memakai indeks satu field otomatis. Biaya baca di [QUOTA.md](QUOTA.md).

### Uji lokal tanpa menyentuh data online

```bash
npm run emulators:demo                      # emulator dengan firestore.demo.rules, project demo-kasir-demo
npm run seed-demo -- aneka-ayam --template ayam --emulator
npm run dev:demo-emulator                   # http://localhost:3000/d/aneka-ayam
```

`npm run dev` sekarang juga mode demo terhadap project kasir-demo asli, jadi baru jalan setelah langkah sekali-saja di atas.

## Aneka Ayam Manado: Setup A ke Setup B

Dilakukan pemilik dari aplikasi, tanpa deploy:

1. Pengaturan → Produk → Ayam Segar 35K…55K: ganti **Cara hitung stok** ke **Stok sendiri**. Item stok per ukuran dibuat otomatis; isi jumlahnya di tab Stok.
2. Pengaturan → Produk → Paket Hemat: **Tidak dilacak**, lalu **Grup pilihan** "Pilih 3 ayam", min 3, max 3, boleh berulang. Tambah opsi per ukuran yang memotong item stok ukuran itu ("Satu opsi per item stok", lalu hapus yang bukan ayam).
3. Pesanan lama tetap benar: batal mengembalikan stok sesuai snapshot saat jual.
