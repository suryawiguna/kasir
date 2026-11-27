import type { Order, Unit } from "../../domain/types";
import { findUnit } from "../units/units";
import { salesIn, type ReportScope } from "./branchScope";

export interface ProductSales {
  productId: string;
  /** Nama di baris pesanan terbaru (nama produk bisa diganti pemilik). */
  name: string;
  unit: Unit;
  /** Satuan dasar (gram untuk kg). Tampilkan dengan `formatQuantity`. */
  quantity: number;
  sales: number;
}

export type ProductSort = "sales" | "quantity";

/**
 * Produk terjual dari baris pesanan. Pilihan paket (`choices`) dan bonus
 * tidak dihitung sebagai produk terpisah. Satu produk yang satuannya pernah
 * diganti muncul sekali per satuan, karena jumlahnya tidak bisa dijumlahkan.
 */
export const productSales = (orders: readonly Order[], scope: ReportScope, units: readonly Unit[], sort: ProductSort = "sales"): ProductSales[] => {
  const rows = new Map<string, ProductSales & { at: string }>();
  for (const o of salesIn(orders, scope)) {
    for (const line of o.items) {
      const key = `${line.productId}|${line.unit}`;
      const row = rows.get(key);
      if (row) {
        row.quantity += line.quantity;
        row.sales += line.total;
        if (o.createdAt > row.at) {
          row.name = line.name;
          row.at = o.createdAt;
        }
      } else {
        rows.set(key, { productId: line.productId, name: line.name, unit: findUnit(units, line.unit), quantity: line.quantity, sales: line.total, at: o.createdAt });
      }
    }
  }
  const list = [...rows.values()].map(({ at: _at, ...row }) => row);
  const by = sort === "sales" ? (r: ProductSales) => r.sales : (r: ProductSales) => r.quantity;
  return list.sort((a, b) => by(b) - by(a) || b.sales - a.sales || a.name.localeCompare(b.name, "id"));
};
