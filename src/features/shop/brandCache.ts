import { CLIENT } from "../../client";
import { brandForeground, brandRamp } from "./shopConfig";

/**
 * Nama, warna, dan logo toko terakhir yang terbaca, disimpan di perangkat.
 * `config/shop` hanya bisa dibaca setelah login, jadi tanpa ini halaman login
 * dan layar muat selalu memakai nama dari client.json dan warna bawaan,
 * meskipun pemilik sudah menggantinya di Pengaturan.
 */
export interface CachedBrand {
  name: string;
  brandColor: string;
  logoUrl?: string;
}

const KEY = `${CLIENT.slug}:brand`;

export const readBrand = (): CachedBrand | null => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<CachedBrand> | null;
    if (!value || typeof value.name !== "string" || typeof value.brandColor !== "string") return null;
    return { name: value.name, brandColor: value.brandColor, logoUrl: typeof value.logoUrl === "string" ? value.logoUrl : undefined };
  } catch {
    return null;
  }
};

export const writeBrand = (brand: CachedBrand) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(brand));
  } catch {
    // Penyimpanan penuh atau diblokir: halaman login memakai bawaan.
  }
};

/** Tulis tangga warna brand ke `:root` (dibaca Tailwind lewat `@theme inline`). */
export const applyBrand = (hex: string) => {
  const root = document.documentElement;
  for (const [step, value] of Object.entries(brandRamp(hex))) root.style.setProperty(`--brand-${step}`, value);
  root.style.setProperty("--brand-fg", brandForeground(hex));
};

/** Dipanggil sekali sebelum render pertama. */
export const applyCachedBrand = () => {
  const brand = readBrand();
  if (!brand) return;
  applyBrand(brand.brandColor);
  document.title = brand.name;
};
