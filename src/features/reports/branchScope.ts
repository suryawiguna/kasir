import type { Order } from "../../domain/types";

/**
 * Siapa yang masuk laporan, di satu tempat: cabang (satu atau gabungan),
 * rentang waktu, dan aturan "terjual".
 *
 * - **Terjual** = lunas (`paymentStatus: 'paid'`) dan tidak batal.
 * - **Tanggal penjualan** = `paidAt` bila ada, kalau tidak `createdAt`.
 *   Pesanan langsung lunas saat dibuat dan tidak punya `paidAt`; pesanan
 *   "bayar nanti" masuk laporan di hari uangnya diterima.
 * - **Belum dibayar** = `unpaid` dan tidak batal, menurut `createdAt`.
 */
export interface ReportScope {
  /** ISO UTC, inklusif. */
  from: string;
  /** ISO UTC, eksklusif. */
  to: string;
  /** Kosong = semua cabang. */
  branchId?: string;
}

export const saleTime = (order: Pick<Order, "paidAt" | "createdAt">): string => order.paidAt ?? order.createdAt;

export const isSale = (order: Pick<Order, "paymentStatus" | "orderStatus">): boolean =>
  order.paymentStatus === "paid" && order.orderStatus !== "cancelled";

export const isOwed = (order: Pick<Order, "paymentStatus" | "orderStatus">): boolean =>
  order.paymentStatus === "unpaid" && order.orderStatus !== "cancelled";

export const inBranch = (order: Pick<Order, "branchId">, branchId?: string): boolean => !branchId || order.branchId === branchId;

export const within = (time: string, scope: Pick<ReportScope, "from" | "to">): boolean => time >= scope.from && time < scope.to;

/** Penjualan di rentang dan cabang ini. */
export const salesIn = (orders: readonly Order[], scope: ReportScope): Order[] =>
  orders.filter((o) => isSale(o) && inBranch(o, scope.branchId) && within(saleTime(o), scope));

/** Pesanan belum dibayar yang dibuat di rentang dan cabang ini. */
export const owedIn = (orders: readonly Order[], scope: ReportScope): Order[] =>
  orders.filter((o) => isOwed(o) && inBranch(o, scope.branchId) && within(o.createdAt, scope));
