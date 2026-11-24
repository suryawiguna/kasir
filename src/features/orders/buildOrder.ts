import type { Order, OrderLine, OrderType, PaymentMethod } from "../../domain/types";
import { sumTotals } from "../pricing/pricing";

/**
 * Satu dokumen pesanan dari hasil checkout, murni. Aturan dari Haoshii yang
 * dipertahankan:
 * - `paymentMethod` kosong sampai uang benar-benar diterima (Bayar nanti).
 * - `cashReceived` selalu diketik kasir, tidak pernah diisi otomatis; tunai
 *   kurang dari total ditolak. Kembalian diturunkan, tidak disimpan.
 * - Field kosong tidak ditulis (rules memakai allowlist dan `in`).
 */
export interface CheckoutInput {
  id: string;
  orderNumber: string;
  branchId: string;
  deviceLetter: string;
  items: OrderLine[];
  orderType: OrderType;
  /** Status awal pesanan langsung, dari config toko (langsung selesai atau diproses dulu). */
  instantStatus: "pending" | "completed";
  /** null = Bayar nanti. */
  payment: { method: PaymentMethod; cashReceived?: number } | null;
  customerName?: string;
  customerContact?: string;
  pickupTime?: string;
  createdBy: string;
  now: string;
}

export type CheckoutResult = { ok: true; order: Order } | { ok: false; message: string };

export const buildOrder = (input: CheckoutInput): CheckoutResult => {
  if (input.items.length === 0) return { ok: false, message: "Keranjang kosong." };
  const totalAmount = sumTotals(input.items);
  const order: Order = {
    id: input.id,
    orderNumber: input.orderNumber,
    branchId: input.branchId,
    deviceLetter: input.deviceLetter,
    items: input.items,
    totalAmount,
    orderType: input.orderType,
    orderStatus: input.orderType === "instant" ? input.instantStatus : "pending",
    paymentStatus: input.payment ? "paid" : "unpaid",
    createdAt: input.now,
    createdBy: input.createdBy,
  };

  if (input.payment) {
    order.paymentMethod = input.payment.method;
    if (input.payment.method === "cash") {
      const cash = input.payment.cashReceived;
      if (typeof cash !== "number" || !Number.isFinite(cash)) {
        return { ok: false, message: "Isi uang yang diterima." };
      }
      if (cash < totalAmount) return { ok: false, message: "Uang yang diterima kurang dari total." };
      order.cashReceived = cash;
    }
  } else if (input.orderType === "instant") {
    return { ok: false, message: "Pesanan langsung harus dibayar. Pilih Bayar nanti untuk pesanan yang belum dibayar." };
  }

  const name = input.customerName?.trim();
  const contact = input.customerContact?.trim();
  if (input.orderType === "preorder" && !name) {
    return { ok: false, message: "Isi nama pelanggan untuk pesanan yang diambil nanti." };
  }
  if (name) order.customerName = name;
  if (contact) order.customerContact = contact;
  if (input.pickupTime) order.pickupTime = input.pickupTime;
  return { ok: true, order };
};

/** Data untuk menandai pesanan belum lunas sebagai dibayar. */
export const collectPaymentPatch = (
  order: Pick<Order, "totalAmount" | "paymentStatus">,
  method: PaymentMethod,
  cashReceived: number | undefined,
  by: string,
  now: string,
): { ok: true; patch: Partial<Order> } | { ok: false; message: string } => {
  if (order.paymentStatus === "paid") return { ok: false, message: "Pesanan ini sudah lunas." };
  const patch: Partial<Order> = { paymentStatus: "paid", paymentMethod: method, paidAt: now, updatedBy: by, updatedAt: now };
  if (method === "cash") {
    if (typeof cashReceived !== "number") return { ok: false, message: "Isi uang yang diterima." };
    if (cashReceived < order.totalAmount) return { ok: false, message: "Uang yang diterima kurang dari total." };
    patch.cashReceived = cashReceived;
  }
  return { ok: true, patch };
};

export const ORDER_STATUS_LABEL: Record<Order["orderStatus"], string> = {
  pending: "Diproses",
  ready: "Siap",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
};

/** Langkah berikutnya untuk tombol status, atau null bila sudah di akhir. */
export const nextStatus = (status: Order["orderStatus"]): Order["orderStatus"] | null => {
  if (status === "pending") return "ready";
  if (status === "ready") return "completed";
  return null;
};

/** Filter laporan: semua cabang (pemilik) atau satu cabang. */
export const filterByBranch = <T extends { branchId: string }>(orders: readonly T[], scope: string | "all"): T[] =>
  scope === "all" ? [...orders] : orders.filter((o) => o.branchId === scope);
