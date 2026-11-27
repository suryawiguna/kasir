import type { Order, PaymentMethod } from "../../domain/types";
import { salesIn, type ReportScope } from "./branchScope";

export interface PaymentRow {
  method: PaymentMethod;
  count: number;
  total: number;
}

/**
 * Penjualan per metode bayar. Metode yang aktif selalu tampil (walau 0);
 * metode yang sudah dimatikan hanya tampil bila ada penjualannya.
 */
export const paymentBreakdown = (orders: readonly Order[], scope: ReportScope, enabled: Record<PaymentMethod, boolean>): PaymentRow[] => {
  const rows: Record<PaymentMethod, PaymentRow> = {
    cash: { method: "cash", count: 0, total: 0 },
    transfer: { method: "transfer", count: 0, total: 0 },
    qris: { method: "qris", count: 0, total: 0 },
  };
  for (const o of salesIn(orders, scope)) {
    if (!o.paymentMethod || !rows[o.paymentMethod]) continue;
    rows[o.paymentMethod].count += 1;
    rows[o.paymentMethod].total += o.totalAmount;
  }
  return Object.values(rows).filter((r) => enabled[r.method] || r.count > 0);
};
