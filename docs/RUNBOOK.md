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
3. Publish ke setiap klien **sebelum** men-deploy aplikasi yang membutuhkannya.

## Aneka Ayam Manado: Setup A ke Setup B

Dilakukan pemilik dari aplikasi, tanpa deploy:

1. Pengaturan → Produk → Ayam Segar 35K…55K: ganti **Cara hitung stok** ke **Stok sendiri**. Item stok per ukuran dibuat otomatis; isi jumlahnya di tab Stok.
2. Pengaturan → Produk → Paket Hemat: **Tidak dilacak**, lalu **Grup pilihan** "Pilih 3 ayam", min 3, max 3, boleh berulang. Tambah opsi per ukuran yang memotong item stok ukuran itu ("Satu opsi per item stok", lalu hapus yang bukan ayam).
3. Pesanan lama tetap benar: batal mengembalikan stok sesuai snapshot saat jual.
