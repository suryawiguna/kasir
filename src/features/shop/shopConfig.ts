import type { ShopConfig, StockPolicy, Timezone, Unit } from "../../domain/types";
import { PRESET_UNITS } from "../units/units";

/**
 * `config/shop`: apa yang membedakan satu toko dari yang lain dan bisa diubah
 * pemilik tanpa deploy. Pembacaan selalu lewat `parseShopConfig`, sehingga
 * dokumen yang belum ada atau setengah terisi tetap menghasilkan config utuh.
 */

export const DEFAULT_BRAND_COLOR = "#0f766e";

export const defaultShopConfig = (name: string): ShopConfig => ({
  name,
  brandColor: DEFAULT_BRAND_COLOR,
  units: [...PRESET_UNITS],
  receipt: { header: [], footer: ["Terima kasih"], showCustomerName: true },
  currency: "IDR",
  timezone: "Asia/Jakarta",
  stockPolicy: "block",
  instantStatus: "completed",
});

const TIMEZONES: readonly Timezone[] = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"];
const STOCK_POLICIES: readonly StockPolicy[] = ["block", "warn"];
const HEX = /^#[0-9a-fA-F]{6}$/;

const isUnit = (value: unknown): value is Unit => {
  if (!value || typeof value !== "object") return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.code === "string" &&
    u.code.length > 0 &&
    typeof u.label === "string" &&
    typeof u.factor === "number" &&
    u.factor >= 1 &&
    typeof u.decimals === "number" &&
    typeof u.step === "number" &&
    u.step > 0
  );
};

const stringList = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : null;

export const parseShopConfig = (data: unknown, fallbackName: string): ShopConfig => {
  const base = defaultShopConfig(fallbackName);
  if (!data || typeof data !== "object") return base;
  const d = data as Record<string, unknown>;
  const units = Array.isArray(d.units) ? d.units.filter(isUnit) : [];
  const receipt = (d.receipt && typeof d.receipt === "object" ? d.receipt : {}) as Record<string, unknown>;
  return {
    name: typeof d.name === "string" && d.name.trim() ? d.name : base.name,
    logoUrl: typeof d.logoUrl === "string" && d.logoUrl ? d.logoUrl : undefined,
    brandColor: typeof d.brandColor === "string" && HEX.test(d.brandColor) ? d.brandColor : base.brandColor,
    units: units.length ? units : base.units,
    receipt: {
      header: stringList(receipt.header) ?? base.receipt.header,
      footer: stringList(receipt.footer) ?? base.receipt.footer,
      showCustomerName:
        typeof receipt.showCustomerName === "boolean" ? receipt.showCustomerName : base.receipt.showCustomerName,
    },
    currency: "IDR",
    timezone: TIMEZONES.includes(d.timezone as Timezone) ? (d.timezone as Timezone) : base.timezone,
    stockPolicy: STOCK_POLICIES.includes(d.stockPolicy as StockPolicy)
      ? (d.stockPolicy as StockPolicy)
      : base.stockPolicy,
    instantStatus: d.instantStatus === "pending" ? "pending" : base.instantStatus,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : undefined,
    updatedBy: typeof d.updatedBy === "string" ? d.updatedBy : undefined,
  };
};

/* ------------------------------------------------------------------ */
/* Warna brand → CSS variable                                          */
/* ------------------------------------------------------------------ */

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

const mix = (hex: string, target: [number, number, number], amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (target[0] - r) * amount, g + (target[1] - g) * amount, b + (target[2] - b) * amount);
};

/**
 * Satu warna brand menjadi tangga 50–900 untuk Tailwind (`bg-brand-600` dll).
 * 600 adalah warna yang dipilih pemilik; yang lain dicampur ke putih/hitam.
 */
export const brandRamp = (hex: string): Record<string, string> => {
  const base = HEX.test(hex) ? hex : DEFAULT_BRAND_COLOR;
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  return {
    "50": mix(base, white, 0.92),
    "100": mix(base, white, 0.84),
    "200": mix(base, white, 0.68),
    "300": mix(base, white, 0.5),
    "400": mix(base, white, 0.25),
    "500": mix(base, white, 0.1),
    "600": base.toLowerCase(),
    "700": mix(base, black, 0.15),
    "800": mix(base, black, 0.3),
    "900": mix(base, black, 0.45),
  };
};

/** Teks di atas warna brand: putih atau hampir hitam, mana yang kontrasnya lebih tinggi. */
export const brandForeground = (hex: string): string => {
  const [r, g, b] = hexToRgb(HEX.test(hex) ? hex : DEFAULT_BRAND_COLOR).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#18181b" : "#ffffff";
};
