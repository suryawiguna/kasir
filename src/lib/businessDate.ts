import type { Timezone } from "../domain/types";

/**
 * Hari kalender toko, yang tidak sama dengan hari UTC. `createdAt` disimpan
 * UTC, jadi penjualan jam 06:00 WITA ada di tanggal UTC kemarin. Semua tanggal
 * bisnis (laporan, nomor pesanan) lewat sini, dengan zona waktu dari
 * `config/shop.timezone`.
 *
 * Indonesia tidak memakai daylight saving, jadi offset tetap.
 */
export const UTC_OFFSETS: Record<Timezone, string> = {
  "Asia/Jakarta": "+07:00",
  "Asia/Makassar": "+08:00",
  "Asia/Jayapura": "+09:00",
};

export const TIMEZONE_LABELS: Record<Timezone, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

const toDate = (value: Date | string): Date => (typeof value === "string" ? new Date(value) : value);

/** YYYY-MM-DD di zona waktu toko. */
export const getBusinessDate = (timezone: Timezone, value: Date | string = new Date()): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/** YYYYMMDD, awalan nomor pesanan. Tahun penuh supaya tidak terbaca DD-MM-YY. */
export const getBusinessDateCompact = (timezone: Timezone, value: Date | string = new Date()): string =>
  getBusinessDate(timezone, value).replace(/-/g, "");

/** HH:mm di zona waktu toko. */
export const getBusinessTime = (timezone: Timezone, value: Date | string = new Date()): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

/** Rentang hari bisnis inklusif ke instant UTC, untuk query `createdAt`. */
export const businessRangeToUtc = (timezone: Timezone, startDate: string, endDate: string) => {
  const offset = UTC_OFFSETS[timezone];
  return {
    startIso: new Date(`${startDate}T00:00:00.000${offset}`).toISOString(),
    endIso: new Date(`${endDate}T23:59:59.999${offset}`).toISOString(),
  };
};
