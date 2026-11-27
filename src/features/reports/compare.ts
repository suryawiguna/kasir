import { divRound } from "../../lib/intMath";
import type { ReportScope } from "./branchScope";
import type { ReportPeriod } from "./period";

/** Rentang periode sebelumnya (panjang sama, lihat period.ts) untuk cabang yang sama. */
export const previousScope = (period: ReportPeriod, branchId?: string): ReportScope => ({
  from: period.prevFrom,
  to: period.prevTo,
  branchId,
});

/**
 * Perubahan dalam persen bulat, atau null bila periode sebelumnya kosong
 * (tidak ada pembanding yang jujur untuk "naik dari nol").
 */
export const percentChange = (current: number, previous: number): number | null =>
  previous > 0 ? divRound((current - previous) * 100, previous) : null;
