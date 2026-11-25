/**
 * Aturan ukuran gambar sebelum diunggah: berapa besar hasil kompresi, cara
 * memotong thumbnail, dan file mana yang ditolak sejak awal. Modul murni;
 * kompresi sebenarnya (canvas) ada di compressImage.ts.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Sisi terpanjang foto produk. Cukup tajam untuk layar tablet, kecil untuk data seluler. */
export const PRODUCT_MAX_SIDE = 1024;
/** Thumbnail persegi untuk daftar kasir (tampil 56px, 4x untuk layar padat). */
export const THUMB_SIDE = 256;
/** Logo tampil 64px bulat; 512 menyisakan ruang untuk struk nanti. */
export const LOGO_MAX_SIDE = 512;

/**
 * File di atas ini ditolak sebelum didekode: canvas sebesar itu di HP murah
 * bisa gagal tanpa pesan atau menutup tab.
 */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Batas piksel sumber (≈ 50 MP), alasan yang sama. */
export const MAX_SOURCE_PIXELS = 50_000_000;

/** Kualitas JPEG yang dicoba berurutan sampai hasilnya muat batas byte. */
export const JPEG_QUALITIES = [0.82, 0.72, 0.6, 0.5] as const;

/** Perkecil supaya sisi terpanjang ≤ max. Tidak pernah memperbesar. */
export const fitWithin = (size: Size, max: number): Size => {
  const longest = Math.max(size.width, size.height);
  if (longest <= max) return { width: size.width, height: size.height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
};

/** Persegi terbesar di tengah, untuk thumbnail. */
export const centerSquare = (size: Size): Rect => {
  const side = Math.min(size.width, size.height);
  return {
    x: Math.floor((size.width - side) / 2),
    y: Math.floor((size.height - side) / 2),
    width: side,
    height: side,
  };
};

/** Pesan untuk file yang jelas tidak bisa dipakai, atau null bila boleh dicoba. */
export const checkSourceFile = (file: { type: string; size: number }): string | null => {
  if (file.size === 0) return "File kosong. Pilih foto lain.";
  if (file.type && !file.type.startsWith("image/")) return "File ini bukan gambar. Pilih JPG atau PNG.";
  if (file.size > MAX_SOURCE_BYTES) return "Foto terlalu besar (lebih dari 25 MB). Pilih foto lain.";
  return null;
};

/** Pesan bila ukuran piksel sumber tidak bisa diproses, atau null. */
export const checkSourceSize = (size: Size): string | null => {
  if (size.width < 1 || size.height < 1) return "Foto ini tidak bisa dibaca. Pilih JPG atau PNG.";
  if (size.width * size.height > MAX_SOURCE_PIXELS) return "Resolusi foto terlalu besar. Pilih foto lain.";
  return null;
};
