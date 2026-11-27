import type { Timezone } from "../../domain/types";
import { getBusinessDate, UTC_OFFSETS } from "../../lib/businessDate";

/**
 * Rentang laporan dan periode pembandingnya, dalam hari bisnis toko
 * (`config/shop.timezone`). Semua batas berupa instant UTC ISO, setengah
 * terbuka `[from, to)`, jadi bisa dibandingkan langsung dengan `createdAt`/
 * `paidAt` (keduanya `toISOString()`) dan dipakai di query Firestore.
 *
 * Periode pembanding punya panjang yang sama dan berhenti di jam yang sama:
 * "Hari ini" jam 15:00 dibandingkan dengan kemarin sampai 15:00, bukan dengan
 * kemarin seharian (yang membuat setiap pagi terlihat turun).
 */
export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "month";

export const RANGE_OPTIONS: readonly { value: RangePreset; label: string }[] = [
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "month", label: "Bulan ini" },
];

export type Granularity = "hour" | "day";

export interface ReportPeriod {
  preset: RangePreset;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** Per jam untuk satu hari, per hari untuk rentang lebih panjang. */
  granularity: Granularity;
  /** Hari bisnis di rentang ini, berurutan (YYYY-MM-DD). */
  dates: string[];
  /** "dari kemarin", untuk teks perbandingan. */
  compareLabel: string;
}

const DAY = 86_400_000;

/** Tengah malam tanggal bisnis di zona toko, dalam ms UTC. Indonesia tanpa DST. */
export const startOfBusinessDate = (timezone: Timezone, date: string): number =>
  new Date(`${date}T00:00:00.000${UTC_OFFSETS[timezone]}`).getTime();

/** Tanggal kalender + n hari (YYYY-MM-DD, tanpa zona). */
export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const datesBetween = (first: string, last: string): string[] => {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
};

const iso = (ms: number) => new Date(ms).toISOString();

export const reportPeriod = (preset: RangePreset, timezone: Timezone, now: Date): ReportPeriod => {
  const today = getBusinessDate(timezone, now);
  const nowMs = now.getTime();
  const start = (date: string) => startOfBusinessDate(timezone, date);

  if (preset === "today" || preset === "yesterday") {
    const date = preset === "today" ? today : addDays(today, -1);
    const from = start(date);
    const to = preset === "today" ? nowMs : start(today);
    return {
      preset,
      from: iso(from),
      to: iso(to),
      prevFrom: iso(from - DAY),
      prevTo: iso(to - DAY),
      granularity: "hour",
      dates: [date],
      compareLabel: preset === "today" ? "dari kemarin" : "dari hari sebelumnya",
    };
  }

  if (preset === "month") {
    const first = `${today.slice(0, 8)}01`;
    const from = start(first);
    const prevFirst = `${addDays(first, -1).slice(0, 8)}01`;
    const prevFrom = start(prevFirst);
    return {
      preset,
      from: iso(from),
      to: iso(nowMs),
      prevFrom: iso(prevFrom),
      // Hari ke-n bulan ini dibandingkan dengan hari ke-n bulan lalu (paling jauh akhir bulan lalu).
      prevTo: iso(Math.min(prevFrom + (nowMs - from), from)),
      granularity: "day",
      dates: datesBetween(first, today),
      compareLabel: "dari bulan lalu",
    };
  }

  const days = preset === "7d" ? 7 : 30;
  const first = addDays(today, -(days - 1));
  const from = start(first);
  return {
    preset,
    from: iso(from),
    to: iso(nowMs),
    prevFrom: iso(from - days * DAY),
    prevTo: iso(nowMs - days * DAY),
    granularity: "day",
    dates: datesBetween(first, today),
    compareLabel: `dari ${days} hari sebelumnya`,
  };
};
