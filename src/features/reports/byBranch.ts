import type { Branch, Order } from "../../domain/types";
import { divRound } from "../../lib/intMath";
import { salesIn, type ReportScope } from "./branchScope";

export interface BranchSales {
  branchId: string;
  name: string;
  sales: number;
  transactions: number;
  /** Porsi penjualan gabungan, persen bulat. */
  share: number;
}

/**
 * Penjualan per cabang untuk filter "Semua cabang", urut seperti daftar
 * cabang. Cabang nonaktif hanya ikut bila punya penjualan di rentang ini.
 */
export const salesByBranch = (orders: readonly Order[], scope: Omit<ReportScope, "branchId">, branches: readonly Branch[]): BranchSales[] => {
  const sales = salesIn(orders, scope);
  const total = sales.reduce((s, o) => s + o.totalAmount, 0);
  const rows = new Map<string, { sales: number; transactions: number }>();
  for (const o of sales) {
    const row = rows.get(o.branchId) ?? { sales: 0, transactions: 0 };
    row.sales += o.totalAmount;
    row.transactions += 1;
    rows.set(o.branchId, row);
  }
  const known = [...branches].sort((a, b) => a.order - b.order);
  const ids = [...known.filter((b) => b.active || rows.has(b.id)).map((b) => b.id), ...[...rows.keys()].filter((id) => !known.some((b) => b.id === id))];
  return ids.map((id) => {
    const row = rows.get(id) ?? { sales: 0, transactions: 0 };
    return {
      branchId: id,
      name: known.find((b) => b.id === id)?.name ?? id,
      ...row,
      share: total > 0 ? divRound(row.sales * 100, total) : 0,
    };
  });
};
