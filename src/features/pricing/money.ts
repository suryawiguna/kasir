/**
 * Satu-satunya tempat uang diformat. Jangan memakai toLocaleString di komponen.
 */
const AMOUNT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** "25.000" */
export const formatAmount = (value: number): string => AMOUNT.format(Math.round(value));

/** "Rp25.000", "-Rp5.000" */
export const formatRupiah = (value: number): string =>
  value < 0 ? `-Rp${formatAmount(-value)}` : `Rp${formatAmount(value)}`;

/** Teks uang yang diketik ("25.000", "25000", "Rp 25.000") ke integer, atau null. */
export const parseRupiahInput = (text: string): number | null => {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
};
