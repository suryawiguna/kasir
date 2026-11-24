import { deleteField, FieldPath, increment, writeBatch, type DocumentReference } from "firebase/firestore";
import { db } from "../../data/firebase";
import { newId, shopDoc } from "../../data/paths";
import { queueWrite } from "../../data/queuedWrite";
import type { Order, OrderStatus, PaymentMethod, StockChange } from "../../domain/types";
import { deductionDelta, restoreDelta, totalConsumed } from "../stock/consumption";
import { collectPaymentPatch } from "./buildOrder";

/**
 * Semua write pesanan dan stok. Aturannya:
 * - **Tidak ada `await` pada write** (queueWrite). UI membaca listener lokal.
 * - Pesanan dan stok yang berubah bersama ditulis dalam satu `writeBatch`.
 * - Stok selalu `increment()`, supaya dua kasir bersamaan tidak saling timpa.
 * - Setiap handler menerima `Order` utuh, bukan id.
 * - Batal mengembalikan stok dari snapshot `consumed`, bukan dari produk saat ini.
 */

type Batch = ReturnType<typeof writeBatch>;

/** Tambahkan update stok ke batch. Kosong = tidak menyentuh dokumen stok. */
const applyInventoryDelta = (
  batch: Batch,
  branchId: string,
  delta: Record<string, number>,
  by: string,
  now: string,
) => {
  const entries = Object.entries(delta).filter(([, v]) => v !== 0);
  if (entries.length === 0) return;
  const ref = shopDoc("inventory", branchId) as DocumentReference;
  const args: unknown[] = [];
  for (const [id, value] of entries) args.push(new FieldPath("levels", id), increment(value));
  args.push("updatedBy", by, "updatedAt", now);
  (batch.update as (ref: DocumentReference, ...rest: unknown[]) => Batch)(ref, ...args);
};

/** Simpan pesanan baru dan potong stok. Pesanan dianggap tersimpan saat fungsi ini kembali. */
export const commitCheckout = (order: Order, onReject?: (message: string) => void) => {
  const batch = writeBatch(db);
  batch.set(shopDoc("orders", order.id), order);
  applyInventoryDelta(batch, order.branchId, deductionDelta(totalConsumed(order.items)), order.createdBy, order.createdAt);
  queueWrite(batch.commit(), `Pesanan ${order.orderNumber}`, onReject);
};

export const updateOrderStatus = (order: Order, status: OrderStatus, by: string) => {
  if (status === "cancelled") throw new Error("Pakai cancelOrder untuk membatalkan.");
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(shopDoc("orders", order.id), { orderStatus: status, updatedBy: by, updatedAt: now });
  queueWrite(batch.commit(), "Status pesanan");
};

export const collectPayment = (
  order: Order,
  method: PaymentMethod,
  cashReceived: number | undefined,
  by: string,
): string | null => {
  const now = new Date().toISOString();
  const result = collectPaymentPatch(order, method, cashReceived, by, now);
  if (!result.ok) return result.message;
  const batch = writeBatch(db);
  batch.update(shopDoc("orders", order.id), result.patch);
  queueWrite(batch.commit(), "Pembayaran");
  return null;
};

/** Pemilik saja (rules). Status jadi dibatalkan dan stok kembali dari snapshot. */
export const cancelOrder = (order: Order, by: string) => {
  if (order.orderStatus === "cancelled") return;
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(shopDoc("orders", order.id), {
    orderStatus: "cancelled",
    cancelledBy: by,
    cancelledAt: now,
    updatedBy: by,
    updatedAt: now,
  });
  applyInventoryDelta(batch, order.branchId, restoreDelta(totalConsumed(order.items)), by, now);
  queueWrite(batch.commit(), "Pembatalan");
};

/** Pemilik saja: kembalikan pesanan lunas ke belum lunas (salah pencet). */
export const markOrderUnpaid = (order: Order, by: string) => {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(shopDoc("orders", order.id), {
    paymentStatus: "unpaid",
    paymentMethod: deleteField(),
    cashReceived: deleteField(),
    paidAt: deleteField(),
    paymentProof: deleteField(),
    updatedBy: by,
    updatedAt: now,
  });
  queueWrite(batch.commit(), "Ubah pembayaran");
};

/**
 * Stok masuk (`add`, increment) atau hitung ulang (`set`, angka hasil hitung).
 * Keduanya dicatat di `stockChanges` untuk Riwayat.
 */
export const adjustStock = (params: {
  branchId: string;
  stockItemId: string;
  mode: "add" | "set";
  value: number;
  current: number;
  note?: string;
  by: string;
}) => {
  const now = new Date().toISOString();
  const after = params.mode === "add" ? params.current + params.value : params.value;
  const delta = after - params.current;
  const batch = writeBatch(db);
  if (params.mode === "add") {
    applyInventoryDelta(batch, params.branchId, { [params.stockItemId]: delta }, params.by, now);
  } else {
    batch.update(
      shopDoc("inventory", params.branchId) as DocumentReference,
      new FieldPath("levels", params.stockItemId),
      params.value,
      "updatedBy",
      params.by,
      "updatedAt",
      now,
    );
  }
  const id = newId("stockChanges");
  const change: StockChange = {
    id,
    branchId: params.branchId,
    stockItemId: params.stockItemId,
    kind: params.mode,
    before: params.current,
    after,
    changedBy: params.by,
    changedAt: now,
    ...(params.note ? { note: params.note } : {}),
  };
  batch.set(shopDoc("stockChanges", id), change);
  queueWrite(batch.commit(), "Perubahan stok");
};
