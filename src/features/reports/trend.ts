import type { Order, Timezone } from "../../domain/types";
import { getBusinessDate, getBusinessTime } from "../../lib/businessDate";
import { saleTime, salesIn, type ReportScope } from "./branchScope";
import type { ReportPeriod } from "./period";

export interface TrendBucket {
  /** YYYY-MM-DD (per hari) atau "09" (per jam). */
  key: string;
  /** "27/11" atau "09.00". */
  label: string;
  total: number;
  /** branchId -> penjualan, untuk batang bertumpuk. */
  byBranch: Record<string, number>;
}

/**
 * Penjualan per hari (setiap hari di rentang, yang kosong = 0) atau per jam.
 * Per jam hanya jam buka: dari jam pertama sampai jam terakhir yang ada
 * penjualan, jam kosong di antaranya = 0. Tanpa penjualan = tanpa batang.
 */
export const salesTrend = (
  orders: readonly Order[],
  scope: ReportScope,
  period: Pick<ReportPeriod, "granularity" | "dates">,
  timezone: Timezone,
): TrendBucket[] => {
  const sales = salesIn(orders, scope);
  const keyOf =
    period.granularity === "day"
      ? (o: Order) => getBusinessDate(timezone, saleTime(o))
      : (o: Order) => getBusinessTime(timezone, saleTime(o)).slice(0, 2);

  const sums = new Map<string, TrendBucket>();
  for (const o of sales) {
    const key = keyOf(o);
    const bucket = sums.get(key) ?? { key, label: "", total: 0, byBranch: {} };
    bucket.total += o.totalAmount;
    bucket.byBranch[o.branchId] = (bucket.byBranch[o.branchId] ?? 0) + o.totalAmount;
    sums.set(key, bucket);
  }

  let keys: string[];
  if (period.granularity === "day") {
    keys = period.dates;
  } else {
    const hours = [...sums.keys()].map(Number);
    if (hours.length === 0) return [];
    keys = [];
    for (let h = Math.min(...hours); h <= Math.max(...hours); h++) keys.push(String(h).padStart(2, "0"));
  }
  return keys.map((key) => ({
    ...(sums.get(key) ?? { key, total: 0, byBranch: {} }),
    key,
    label: period.granularity === "day" ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : `${key}.00`,
  }));
};
