# Design system

Diambil dari Haoshii Dimsum (`docs/DESIGN.md` di repo itu, yang berisi alasan lengkap setiap aturan). Komponen dan token di sini adalah port dari sana. **Satu perbedaan: warna brand datang dari data**, bukan dari kode.

## 0. Dua aturan utama

1. **Satu cara untuk setiap hal.** Satu tinggi kontrol, satu radius, satu overlay, satu breakpoint. Jangan membuat varian baru di pemanggil; tambahkan ke sistem bila memang perlu.
2. **Kasir dipakai berdiri, satu tangan, di bawah matahari.** Target sentuh minimal 44px, angka besar dan tabular, status dibaca dari warna dan kata (tidak pernah warna saja).

## 1. Warna

- **Brand adalah tangga 50–900 dari satu warna pilihan pemilik** (`config/shop.brandColor`, Pengaturan → Toko). Warna pilihan di **500**, lainnya dicampur ke putih/hitam (`brandRamp` di [shopConfig.ts](../src/features/shop/shopConfig.ts), dites). `ShopProvider` menulis `--brand-*` ke `:root`; Tailwind memakai `bg-brand-500` dll. lewat `@theme inline` di [index.css](../src/index.css).
- **Teks brand di atas putih: `text-brand-700`.** Untuk warna terang (kuning, hijau muda), `brandRamp` menggelapkan 700–900 sampai kontras ≥ 4.5 terhadap brand-50. Jangan memakai `text-brand-500`/`600` untuk teks.
- Nama, warna, dan logo terakhir disimpan di perangkat (`brandCache.ts`), jadi halaman login dan layar muat sudah memakai identitas toko sebelum `config/shop` terbaca.
- **Teks di atas brand: `text-brand-fg`**, putih atau hampir hitam sesuai kontras (`brandForeground`). Haoshii memakai `text-white` karena oranyenya tetap; di sini toko bisa memilih kuning.
- Netral: zinc. Halaman `bg-zinc-50`, kartu `bg-white` bergaris `zinc-200`.
- **Semua aksi dan aksen ikut brand**, termasuk tombol Bayar/Terima pembayaran, kotak Kembalian, ikon berhasil, toast berhasil, dan kotak centang bawaan browser (`accent-color`). Toko berwarna ungu tidak boleh melihat tombol hijau.
- Semantik hanya untuk **status dan peringatan**, sama di semua toko: **emerald** = pill Selesai/Lunas, **amber** = perlu perhatian (menipis, belum bayar, diproses), **red** = habis/galat/hapus, **sky** = siap diambil. Jangan memakai warna ini untuk tombol aksi selain `.btn-danger`.

## 2. Tipografi

- **Nunito**, di-host sendiri ([src/assets/fonts](../src/assets/fonts)), dideklarasikan dan di-preload di `index.html` dengan `font-display: block`. Ikut precache service worker.
- Setiap langkah teks = Tailwind + 1px (x-height Nunito lebih kecil); tinggi baris dipatok ke nilai piksel Tailwind.
- Sentence case di semua label. `uppercase` hanya di `.table-head`.
- Angka uang dan jumlah: `tabular-nums`. Uang hanya lewat `formatRupiah`/`formatAmount`.
- Input minimal 16px (`text-base`), atau Safari iOS memperbesar halaman.

## 3. Ukuran, jarak, bentuk

- **Satu tinggi kontrol `h-11`** (44px). Kecil: `.btn-sm` `h-9`, hanya di dalam baris padat.
- **Satu radius `rounded-xl`**. Sheet di HP `rounded-t-2xl`.
- Jarak: kelipatan 4; antar kartu `space-y-2`/`gap-2`, dalam kartu `card-pad` (16px), antar bagian `space-y-4`.
- Gerak: `transition duration-200`, tekan `active:scale-[0.98]`, overlay masuk/keluar 200ms (`TRANSITION_MS`).
- Disabled: `opacity-50` + `cursor-not-allowed`, dan alasannya ditulis ("Stok tidak cukup"), bukan hanya diredupkan.
- Ikon: lucide, 18–20px di tombol, `[&>svg]:shrink-0` sudah di class tombol.

## 4. Tata letak

- **Satu breakpoint: `lg`** (1024px). `useIsDesktop` untuk memilih satu cabang render, bukan merender dua lalu menyembunyikan satu.
- HP: isi + nav bawah 4rem (`h-nav-safe`, dengan menu Akun). Desktop: kartu nav 224px menempel di kiri `app-shell` yang di tengah, sisa stok di bawahnya, isi di `page-rail`.
- Safe area: `pt-safe-4`, `pb-safe-3`, `pb-nav-safe`, `bottom-above-nav`.
- Z-index: konten < bar keranjang (30) < nav (40) < semua overlay (60, urutan buka menentukan tumpukan) < dropdown (80) < toast.

## 5. Komponen

| Komponen | File | Catatan |
|---|---|---|
| Tombol | `.btn-primary` (satu per layar, termasuk Bayar), `.btn-secondary` (tint brand), `.btn-neutral` (abu terisi), `.btn-ghost`, `.btn-danger` / `.btn-danger-quiet`, `.btn-icon` (persegi, wajib aria-label) | [index.css](../src/index.css) |
| Field | `.field-input`, `.field-select`, `.field-label`, `.field-hint`, `.field-error`; `<Field>` (pakai `group` untuk kontrol non-input) | [ui.tsx](../src/components/ui.tsx) |
| Kartu | `.card` (bentuk saja) + `.card-pad`; `.card-tint`, `.card-warn`, `.card-danger` | |
| Baris | `.row-tap` di dalam `card divide-y`, diakhiri `RowChevron` | |
| Tabel (desktop) | `.table-head`, `.table-cell`, `.table-cell-num`, `.table-row` | |
| Pill | `.pill`; `StatusPill`, `PaidPill` | |
| Overlay | `Drawer` (sheet / dialog, portal ke body, geser header untuk menutup, Back/Escape). Fokus awal: `data-autofocus`, bukan `autoFocus` (panel masih `inert` saat dipasang) | [Drawer.tsx](../src/components/Drawer.tsx) |
| Konfirmasi | `Confirm` (dialog xs, aksi di kiri, Batal di kanan; `tone="danger"` hanya untuk hapus/batal) | |
| Dropdown | `SelectMenu` (pengganti `<select>`), `ActionMenu` (menu aksi) | [SelectMenu.tsx](../src/components/SelectMenu.tsx), [ActionMenu.tsx](../src/components/ActionMenu.tsx) |
| Pilihan | `SegmentedControl` (`scrollable` untuk daftar panjang), `Toggle` (saklar), `CheckRow` | |
| Jumlah | `Stepper` (− menjadi tempat sampah di minimum) | |
| Status | `StatusTimeline` Diproses → Siap → Selesai + satu tombol bernama langkah berikutnya | |
| Kosong / memuat | `Empty`, `Skeleton` | |
| Toast | sonner, `top-center`, `richColors` (berhasil = brand, galat = merah), font aplikasi, 480px dari `lg` | [main.tsx](../src/main.tsx) |

## 6. Kasir

- Menu **satu kolom**: seluruh baris menambah satu; `+` tint brand (bukan solid, supaya tidak lebih keras dari tombol Bayar); begitu ada di keranjang, baris berwarna dan stepper muncul di baris.
- Produk per berat membuka sheet timbang; produk dengan pilihan membuka sheet pilihan.
- Keranjang: kolom 400px dari `lg`; di HP sheet dari bar mengambang di atas nav bawah.
- Satu alur checkout: "Bayar nanti" satu-satunya yang mengubahnya.

## 7. Menambah sesuatu

Cari dulu di tabel di atas. Bila tidak ada yang cocok, tambahkan ke `index.css` atau `components/`, tulis di sini, baru dipakai. Jangan menulis gaya tombol, field, atau overlay langsung di halaman.
