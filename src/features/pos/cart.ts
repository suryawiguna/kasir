import type { Consume, LineChoice, OrderLine, Product, Unit } from "../../domain/types";
import { lineTotal, unitPriceFor } from "../pricing/pricing";
import { choicesKey, consumptionForLine, validateChoices } from "../stock/consumption";
import { findUnit, stepBase } from "../units/units";

/**
 * Keranjang kasir, murni. Satu baris = satu produk + satu set pilihan.
 * `quantity` selalu dalam satuan dasar (gram untuk produk per kg).
 */
export interface CartLine {
  key: string;
  productId: string;
  quantity: number;
  choices?: LineChoice[];
}

export interface Catalog {
  productsById: ReadonlyMap<string, Product>;
  units: readonly Unit[];
  branchId: string;
}

export const cartLineKey = (productId: string, choices?: readonly LineChoice[]): string =>
  `${productId}#${choicesKey(choices)}`;

/** Produk ini dijual di cabang ini? */
export const isSoldAtBranch = (product: Pick<Product, "branchIds" | "active">, branchId: string): boolean =>
  product.active && (!product.branchIds || product.branchIds.length === 0 || product.branchIds.includes(branchId));

export interface TillFilter {
  branchId: string;
  /** Id kategori yang dimatikan "Tampil di kasir". */
  hiddenCategoryIds: ReadonlySet<string>;
  weightSales: boolean;
  bundles: boolean;
}

/**
 * Produk yang tampil di kasir: aktif, dijual di cabang ini, kategorinya tidak
 * disembunyikan, dan fiturnya (jual per berat, paket) menyala.
 */
export const sellableProducts = <P extends Product>(products: readonly P[], f: TillFilter): P[] =>
  products.filter(
    (p) =>
      isSoldAtBranch(p, f.branchId) &&
      !(p.categoryId && f.hiddenCategoryIds.has(p.categoryId)) &&
      (f.weightSales || p.soldBy !== "weight") &&
      (f.bundles || !p.choiceGroups?.length),
  );

/** Fitur produk yang menentukan bagaimana kasir memakai data produk. */
export interface TillProductFlags {
  stockTracking: boolean;
  branchPricing: boolean;
  freeItems: boolean;
}

/**
 * Produk seperti yang dipakai kasir. Fitur yang dimatikan pemilik berhenti
 * berlaku tanpa menghapus datanya: produk di database tetap utuh (dan form
 * produk tetap menyimpannya), hanya salinan untuk kasir yang dipangkas.
 * - Hitung stok mati: tidak ada konsumsi, termasuk dari opsi pilihan.
 * - Harga per cabang mati: semua cabang memakai harga dasar.
 * - Bonus gratis mati: tidak ada bonus.
 */
export const tillProduct = (product: Product, f: TillProductFlags): Product => {
  if (f.stockTracking && f.branchPricing && f.freeItems) return product;
  const next: Product = { ...product };
  if (!f.stockTracking) {
    next.stockMode = "none";
    next.consumes = [];
    if (next.choiceGroups) {
      next.choiceGroups = next.choiceGroups.map((g) => ({
        ...g,
        options: g.options.map(({ consumes: _drop, ...o }) => o),
      }));
    }
  }
  if (!f.branchPricing) delete next.priceByBranch;
  if (!f.freeItems) delete next.freeItems;
  return next;
};

/**
 * Tambah ke keranjang. Baris dengan produk dan pilihan yang sama digabung,
 * kecuali produk per berat: setiap timbangan jadi baris sendiri supaya struk
 * menunjukkan setiap timbangan.
 */
export const addToCart = (
  cart: readonly CartLine[],
  product: Product,
  quantity: number,
  choices?: LineChoice[],
): CartLine[] => {
  if (!(quantity > 0)) return [...cart];
  const key = cartLineKey(product.id, choices);
  if (product.soldBy === "weight") {
    const used = cart
      .filter((l) => l.key.startsWith(`${key}@`))
      .map((l) => Number(l.key.slice(key.length + 1)) || 0);
    const n = used.length ? Math.max(...used) + 1 : 1;
    return [...cart, { key: `${key}@${n}`, productId: product.id, quantity, ...(choices?.length ? { choices } : {}) }];
  }
  const existing = cart.find((l) => l.key === key);
  if (existing) {
    return cart.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
  }
  return [...cart, { key, productId: product.id, quantity, ...(choices?.length ? { choices } : {}) }];
};

/** Ubah jumlah satu baris; 0 atau kurang menghapusnya. */
export const setLineQuantity = (cart: readonly CartLine[], key: string, quantity: number): CartLine[] =>
  quantity > 0 ? cart.map((l) => (l.key === key ? { ...l, quantity } : l)) : cart.filter((l) => l.key !== key);

/** +/- satu langkah satuan. */
export const stepLine = (
  cart: readonly CartLine[],
  key: string,
  direction: 1 | -1,
  catalog: Catalog,
): CartLine[] => {
  const line = cart.find((l) => l.key === key);
  if (!line) return [...cart];
  const product = catalog.productsById.get(line.productId);
  const unit = findUnit(catalog.units, product?.unit ?? "");
  return setLineQuantity(cart, key, line.quantity + direction * stepBase(unit));
};

export interface PricedLine extends CartLine {
  product: Product;
  unit: Unit;
  price: number;
  total: number;
  consumed: Consume[];
}

/**
 * Harga dan konsumsi setiap baris keranjang. Baris yang produknya sudah tidak
 * ada (dihapus pemilik di perangkat lain) dibuang.
 */
export const priceCart = (cart: readonly CartLine[], catalog: Catalog): PricedLine[] => {
  const priced: PricedLine[] = [];
  for (const line of cart) {
    const product = catalog.productsById.get(line.productId);
    if (!product) continue;
    const unit = findUnit(catalog.units, product.unit);
    const price = unitPriceFor(product, catalog.branchId, line.choices);
    priced.push({
      ...line,
      product,
      unit,
      price,
      total: lineTotal(price, line.quantity, unit.factor),
      consumed: consumptionForLine({
        product,
        quantity: line.quantity,
        factor: unit.factor,
        choices: line.choices,
        productsById: catalog.productsById,
      }),
    });
  }
  return priced;
};

/** Masalah keranjang yang menghalangi checkout (selain stok), atau null. */
export const cartProblem = (priced: readonly PricedLine[], branchId: string): string | null => {
  if (priced.length === 0) return "Keranjang kosong.";
  for (const line of priced) {
    if (!isSoldAtBranch(line.product, branchId)) return `${line.product.name} tidak dijual di cabang ini.`;
    const choiceProblem = validateChoices(line.product, line.choices ?? []);
    if (choiceProblem) return `${line.product.name}: ${choiceProblem}`;
  }
  return null;
};

/**
 * Baris pesanan dari keranjang. Menyalin nama, harga, pilihan dan konsumsi
 * saat itu: pesanan adalah catatan apa yang terjadi, bukan referensi ke menu.
 */
export const toOrderLines = (
  priced: readonly PricedLine[],
  productsById: ReadonlyMap<string, Product>,
  newId: () => string,
): OrderLine[] =>
  priced.map((line) => {
    const freeItems = (line.product.freeItems ?? [])
      .filter((f) => f.qty > 0 && productsById.has(f.productId))
      .map((f) => ({ productId: f.productId, name: productsById.get(f.productId)!.name, qty: f.qty }));
    const order: OrderLine = {
      id: newId(),
      productId: line.product.id,
      name: line.product.name,
      unit: line.unit.code,
      quantity: line.quantity,
      price: line.price,
      total: line.total,
      consumed: line.consumed,
    };
    if (line.product.sku) order.sku = line.product.sku;
    if (line.choices?.length) order.choices = line.choices.map((c) => ({ ...c }));
    if (freeItems.length) order.freeItems = freeItems;
    return order;
  });

/** Pesan tunai: kembalian dihitung, tidak pernah disimpan. */
export const changeDue = (cashReceived: number, total: number): number => cashReceived - total;

/** Saran uang pas dan pecahan umum di atas total. */
export const cashSuggestions = (total: number): number[] => {
  if (total <= 0) return [];
  const notes = [2000, 5000, 10000, 20000, 50000, 100000];
  const out = new Set<number>([total]);
  for (const note of notes) {
    const rounded = Math.ceil(total / note) * note;
    if (rounded > total) out.add(rounded);
    if (out.size >= 4) break;
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
};
