import type { Unit } from "../../domain/types";

/**
 * Satuan bawaan untuk toko baru. Pemilik bisa menambah, mengganti label, dan
 * menyembunyikan satuan di Pengaturan → Satuan. `code` tidak pernah berubah
 * karena produk, item stok, dan pesanan lama menyimpannya.
 */
export const PRESET_UNITS: Unit[] = [
  { code: "pcs", label: "pcs", factor: 1, decimals: 0, step: 1 },
  { code: "ekor", label: "ekor", factor: 1, decimals: 0, step: 1 },
  { code: "pasang", label: "pasang", factor: 1, decimals: 0, step: 1 },
  { code: "porsi", label: "porsi", factor: 1, decimals: 0, step: 1 },
  { code: "paket", label: "paket", factor: 1, decimals: 0, step: 1 },
  { code: "botol", label: "botol", factor: 1, decimals: 0, step: 1 },
  { code: "bungkus", label: "bungkus", factor: 1, decimals: 0, step: 1 },
  { code: "kg", label: "kg", baseLabel: "gram", factor: 1000, decimals: 2, step: 0.1 },
  { code: "gram", label: "gram", factor: 1, decimals: 0, step: 50 },
  { code: "liter", label: "liter", baseLabel: "ml", factor: 1000, decimals: 2, step: 0.1 },
  { code: "ml", label: "ml", factor: 1, decimals: 0, step: 50 },
];

/**
 * Satuan untuk sebuah kode, atau satuan netral (faktor 1) bila kodenya tidak
 * dikenal. Tidak pernah melempar error: pesanan lama harus tetap bisa tampil
 * walaupun satuannya sudah tidak ada di config.
 */
export const findUnit = (units: readonly Unit[], code: string): Unit =>
  units.find((u) => u.code === code) ?? { code, label: code, factor: 1, decimals: 0, step: 1 };

/** Nilai tampil (1,5 kg) ke satuan dasar (1500). */
export const toBase = (value: number, unit: Unit): number => Math.round(value * unit.factor);

/** Satuan dasar (1500) ke nilai tampil (1,5). */
export const fromBase = (base: number, unit: Unit): number => base / unit.factor;

/** Langkah input dalam satuan dasar, minimal 1. */
export const stepBase = (unit: Unit): number => Math.max(1, Math.round(unit.step * unit.factor));

/**
 * Angka gaya Indonesia: koma desimal, titik ribuan, nol di belakang dibuang.
 * 1500 gram dengan kg → "1,5"; 3 ekor → "3".
 */
export const formatUnitNumber = (base: number, unit: Unit): string =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: unit.decimals,
  }).format(fromBase(base, unit));

/** "1,5 kg", "3 ekor". */
export const formatQuantity = (base: number, unit: Unit): string =>
  `${formatUnitNumber(base, unit)} ${unit.label}`;

/**
 * Teks yang diketik kasir ke satuan dasar, atau null bila tidak valid.
 *
 * Koma adalah desimal ("1,5"). Titik dianggap desimal hanya bila tidak ada koma
 * dan satuannya punya desimal ("1.5" kg). Pada satuan tanpa desimal, titik
 * dianggap pemisah ribuan ("1.000" pcs = 1000). Hasil harus > 0 dan dibulatkan
 * ke satuan dasar; angka lebih presisi dari satuan dasar dibulatkan.
 */
export const parseQuantityInput = (text: string, unit: Unit): number | null => {
  let cleaned = text.trim().replace(/\s/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (unit.decimals === 0) {
    cleaned = cleaned.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const base = toBase(Number(cleaned), unit);
  return base > 0 ? base : null;
};

/** Kode satuan baru dari label: huruf kecil, tanpa spasi. */
export const unitCodeFromLabel = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Pesan galat untuk satuan yang akan disimpan, atau null bila valid. */
export const validateUnit = (unit: Unit, others: readonly Unit[]): string | null => {
  if (!unit.code) return "Kode satuan wajib diisi.";
  if (!unit.label.trim()) return "Nama satuan wajib diisi.";
  if (!Number.isInteger(unit.factor) || unit.factor < 1) return "Faktor harus bilangan bulat ≥ 1.";
  if (!Number.isInteger(unit.decimals) || unit.decimals < 0 || unit.decimals > 3)
    return "Desimal antara 0 dan 3.";
  if (!(unit.step > 0)) return "Langkah input harus > 0.";
  if (others.some((u) => u.code === unit.code)) return `Kode "${unit.code}" sudah dipakai.`;
  return null;
};

/** Gabungkan satuan bawaan dengan config toko; config yang menang. */
export const mergeUnits = (stored: readonly Unit[] | undefined): Unit[] => {
  if (!stored || stored.length === 0) return [...PRESET_UNITS];
  return [...stored];
};
