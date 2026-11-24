# Design system (basis)

Turunan ringkas dari `docs/DESIGN.md` Haoshii, dengan warna brand sebagai variabel.

- **Warna brand = tangga 50–900 dari satu warna pilihan pemilik** (`config/shop.brandColor`). `ShopProvider` menulis `--brand-*` dan `--brand-fg` ke `:root`; Tailwind memakai `bg-brand-600` dll. lewat `@theme inline` di [src/index.css](../src/index.css). Teks di atas brand (`text-brand-fg`) putih atau hampir hitam, mana yang kontrasnya lebih tinggi.
- **Satu tinggi kontrol** `h-11` (kecil: `btn-sm` `h-9`), **satu radius** `rounded-xl` (kartu `rounded-2xl`).
- Komponen: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.field`, `.label`, `.hint`, `.card`, `.pill` di `index.css`; `Drawer`, `Confirm`, `Stepper`, `Segmented`, `Toggle`, `Field`, `Empty` di [src/components/ui.tsx](../src/components/ui.tsx).
- **Semua overlay lewat `Drawer`**: bottom sheet di HP, popup di tengah dari `lg`. Back/Escape menutup yang paling atas.
- **Satu breakpoint: `lg`.** HP: header atas + nav bawah. Desktop: sidebar 224px.
- Angka uang dan jumlah: `tabular`. Uang hanya lewat `formatRupiah`/`formatAmount`.
- Teks: Bahasa Indonesia, sentence case, tidak ada `uppercase`.
- Status stok: warna hanya di sel yang menipis (amber) atau habis (merah).
