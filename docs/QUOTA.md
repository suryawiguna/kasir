# Kuota baca

Pola dari Haoshii (`docs/QUOTA.md` di repo itu, dengan alasan lengkapnya). Setiap klien memakai paket Spark: **50.000 baca per hari per project**, dan melewatinya membuat aplikasi berhenti membaca sampai kuota direset (±14:00 WIB), bukan menambah tagihan. Perkiraan harian lengkap ada di [DATA-PLAN.md §14](DATA-PLAN.md).

Aturan:
- Setiap query punya batas dan hanya aktif saat layarnya terbuka.
- Setiap perubahan biaya baca dicatat di sini.

## Laporan (Fase 5)

[useReportOrders](../src/features/reports/useReportOrders.ts) hidup hanya selama tab Laporan terbuka; keluar tab melepas listener dan membuang data.

| Aksi | Baca |
|---|---|
| Buka Laporan ("Hari ini", bawaan) | pesanan kemarin + hari ini, semua cabang (pembanding butuh kemarin) |
| Ganti ke rentang yang lebih panjang | hanya hari yang belum dimuat: 7 hari → 14 hari terakhir, 30 hari → 60 hari, Bulan ini → sejak tanggal 1 bulan lalu |
| Ganti ke rentang yang sudah dimuat, atau ganti cabang | 0 (difilter di klien; dicek di emulator) |
| Penjualan baru selama tab terbuka | 1 per pesanan yang berubah (listener hari ini) |
| Stok menipis | 0 untuk cabang perangkat ini, 1 per cabang lain |

Pesanan "bayar nanti" yang dibuat sebelum rentang tapi dibayar di dalamnya dibaca lewat query `paidAt` kedua; pesanan yang dibuat dan dibayar di rentang yang sama terbaca dua kali (biasanya sedikit, hanya pesanan yang dibayar belakangan punya `paidAt`).

Contoh Aneka Ayam (2 cabang, ±150 pesanan per cabang per hari): 30 hari = 60 hari × 300 ≈ **18.000 baca** sekali buka. Itu 36% kuota harian. Untuk klien seramai itu, "30 hari" dan "Bulan ini" sebaiknya diganti **ringkasan harian** (DATA-PLAN §7, `summaryDelta` di batch checkout), yang membuat 30 hari ≈ 60 baca. Ringkasan di server (Cloud Functions) butuh paket Blaze dan belum dikerjakan.

Demo (kasir-demo, satu project untuk semua prospek): demo 2 cabang berisi ±27 pesanan per hari, jadi "30 hari" ≈ 800 baca per kunjungan (30 hari sebelumnya kosong).
