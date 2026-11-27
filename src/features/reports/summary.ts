import type { Order } from "../../domain/types";
import { divRound } from "../../lib/intMath";
import { owedIn, salesIn, type ReportScope } from "./branchScope";

export interface Summary {
  /** Total `totalAmount` penjualan, integer rupiah. */
  sales: number;
  transactions: number;
  /** sales / transactions, dibulatkan ke rupiah. 0 bila tidak ada transaksi. */
  average: number;
  /** Total pesanan belum dibayar (tidak batal) yang dibuat di rentang ini. */
  owed: number;
  owedCount: number;
}

export const summarize = (orders: readonly Order[], scope: ReportScope): Summary => {
  const sales = salesIn(orders, scope);
  const owed = owedIn(orders, scope);
  const total = sales.reduce((s, o) => s + o.totalAmount, 0);
  return {
    sales: total,
    transactions: sales.length,
    average: sales.length ? divRound(total, sales.length) : 0,
    owed: owed.reduce((s, o) => s + o.totalAmount, 0),
    owedCount: owed.length,
  };
};
