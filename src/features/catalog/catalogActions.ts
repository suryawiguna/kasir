import { deleteDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../data/firebase";
import { newId, shopDoc, shopSingleton, type ShopCollection } from "../../data/paths";
import { queueWrite } from "../../data/queuedWrite";
import type { Branch, Category, Product, ShopConfig, StockItem } from "../../domain/types";
import type { FeatureFlags } from "../settings/featureFlags";
import { consumesForMode, ownStockItemId } from "../stock/consumption";
import { findUnit } from "../units/units";

/**
 * Write katalog dan pengaturan, hanya pemilik (rules). Semua lewat
 * queueWrite: tidak ada await.
 */

/** Firestore menolak `undefined`. Buang secara rekursif. */
export const clean = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, clean(v)]),
    ) as T;
  }
  return value;
};

export const makeId = (name: ShopCollection) => newId(name);

/** Id yang bisa dibaca dari nama, untuk koleksi kecil (cabang, kategori). */
export const slugId = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";

export const saveShopConfig = (config: ShopConfig, by: string) => {
  const data = clean({ ...config, updatedBy: by, updatedAt: new Date().toISOString() });
  queueWrite(setDoc(shopSingleton("config", "shop"), data), "Pengaturan toko");
};

export const saveFeatures = (features: FeatureFlags, by: string) => {
  queueWrite(
    setDoc(shopSingleton("settings", "features"), { ...features, updatedBy: by, updatedAt: new Date().toISOString() }),
    "Fitur",
  );
};

/** Cabang baru sekaligus dokumen stoknya, supaya kasir di cabang itu bisa langsung jualan. */
export const saveBranch = (branch: Branch, isNew: boolean, by: string) => {
  const batch = writeBatch(db);
  batch.set(shopDoc("branches", branch.id), clean(branch));
  if (isNew) {
    batch.set(shopDoc("inventory", branch.id), { levels: {}, updatedBy: by, updatedAt: new Date().toISOString() });
  }
  queueWrite(batch.commit(), `Cabang ${branch.name}`);
};

export const saveCategory = (category: Category) =>
  queueWrite(setDoc(shopDoc("categories", category.id), clean(category)), `Kategori ${category.name}`);

export const deleteCategory = (category: Category) =>
  queueWrite(deleteDoc(shopDoc("categories", category.id)), `Hapus kategori ${category.name}`);

export const saveStockItem = (item: StockItem) =>
  queueWrite(setDoc(shopDoc("stockItems", item.id), clean(item)), `Item stok ${item.name}`);

/**
 * Simpan produk. consumes ditulis ulang sesuai mode stok:
 * - "own": item stok `own-<id>` dibuat (atau diaktifkan lagi) dengan nama dan
 *   satuan produk.
 * - "shared": daftar item stok yang dipilih pemilik.
 * - "none": kosong.
 * Item stok "own" lama tidak dihapus saat mode diganti (pesanan lama
 * menyimpannya), hanya dinonaktifkan.
 */
export const saveProduct = (
  product: Product,
  sharedConsumes: Product["consumes"],
  stockItems: readonly StockItem[],
  units: ShopConfig["units"],
) => {
  const unit = findUnit(units, product.unit);
  const consumes = consumesForMode(product.stockMode, product.id, unit.factor, sharedConsumes);
  const data = clean({ ...product, consumes });
  const batch = writeBatch(db);
  batch.set(shopDoc("products", product.id), data);

  const ownId = ownStockItemId(product.id);
  const existingOwn = stockItems.find((s) => s.id === ownId);
  if (product.stockMode === "own") {
    const item: StockItem = {
      id: ownId,
      name: product.name,
      unit: product.unit,
      active: true,
      order: existingOwn?.order ?? stockItems.length,
      ownerProductId: product.id,
      ...(existingOwn?.lowAt !== undefined ? { lowAt: existingOwn.lowAt } : {}),
    };
    batch.set(shopDoc("stockItems", ownId), item);
  } else if (existingOwn?.active) {
    batch.set(shopDoc("stockItems", ownId), { ...existingOwn, active: false });
  }
  queueWrite(batch.commit(), `Produk ${product.name}`);
};

export const deleteProduct = (product: Product) =>
  queueWrite(deleteDoc(shopDoc("products", product.id)), `Hapus produk ${product.name}`);
