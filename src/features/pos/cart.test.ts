import { describe, expect, it } from "vitest";
import type { Product } from "../../domain/types";
import { PRESET_UNITS } from "../units/units";
import { buildOrder, collectPaymentPatch, filterByBranch } from "../orders/buildOrder";
import {
  addToCart,
  cartProblem,
  cashSuggestions,
  isSoldAtBranch,
  priceCart,
  sellableProducts,
  stepLine,
  tillProduct,
  toOrderLines,
} from "./cart";

const p = (over: Partial<Product> & Pick<Product, "id">): Product => ({
  name: over.id,
  price: 40000,
  unit: "ekor",
  soldBy: "count",
  stockMode: "shared",
  consumes: [{ stockItemId: "ayam", qty: 1 }],
  active: true,
  order: 0,
  ...over,
});

const ayam = p({ id: "ayam40", sku: "AS002" });
const kaki = p({ id: "kaki", unit: "kg", soldBy: "weight", price: 25000, consumes: [{ stockItemId: "kaki", qty: 1000 }] });
const hati = p({ id: "hati", unit: "pasang", price: 2500, consumes: [{ stockItemId: "hati", qty: 1 }] });
const promo = p({ id: "promo", freeItems: [{ productId: "hati", qty: 1 }] });
const paket = p({
  id: "paket",
  unit: "paket",
  price: 120000,
  stockMode: "none",
  choiceGroups: [
    {
      id: "g",
      label: "Pilih 3 ayam",
      min: 3,
      max: 3,
      allowRepeat: true,
      options: [{ id: "u40", label: "40K", consumes: [{ stockItemId: "ayam40", qty: 1 }] }],
    },
  ],
});
const productsById = new Map([ayam, kaki, hati, promo, paket].map((x) => [x.id, x]));
const catalog = { productsById, units: PRESET_UNITS, branchId: "tkl" };

describe("cart", () => {
  it("produk hitungan digabung, produk berat jadi baris per timbangan", () => {
    let cart = addToCart([], ayam, 1);
    cart = addToCart(cart, ayam, 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    cart = addToCart(cart, kaki, 1500);
    cart = addToCart(cart, kaki, 800);
    expect(cart).toHaveLength(3);
    expect(new Set(cart.map((l) => l.key)).size).toBe(3);
  });

  it("step memakai langkah satuan dan menghapus di nol", () => {
    let cart = addToCart([], kaki, 100);
    cart = stepLine(cart, cart[0].key, 1, catalog);
    expect(cart[0].quantity).toBe(200);
    cart = stepLine(cart, cart[0].key, -1, catalog);
    cart = stepLine(cart, cart[0].key, -1, catalog);
    expect(cart).toEqual([]);
  });

  it("harga, total dan snapshot konsumsi", () => {
    const cart = addToCart(addToCart([], ayam, 2), kaki, 1500);
    const priced = priceCart(cart, catalog);
    expect(priced.map((l) => [l.total, l.consumed])).toEqual([
      [80000, [{ stockItemId: "ayam", qty: 2 }]],
      [37500, [{ stockItemId: "kaki", qty: 1500 }]],
    ]);
  });

  it("pilihan belum lengkap menghalangi checkout", () => {
    const cart = addToCart([], paket, 1, [{ groupId: "g", optionId: "u40", label: "40K", count: 2 }]);
    expect(cartProblem(priceCart(cart, catalog), "tkl")).toBe("paket: Pilih 3 ayam: pilih 1 lagi.");
  });

  it("produk khusus cabang lain ditolak", () => {
    const only = p({ id: "pkmOnly", branchIds: ["pkm"] });
    expect(isSoldAtBranch(only, "tkl")).toBe(false);
    expect(isSoldAtBranch(only, "pkm")).toBe(true);
    expect(isSoldAtBranch({ ...ayam, active: false }, "tkl")).toBe(false);
    const cat2 = { ...catalog, productsById: new Map([[only.id, only]]) };
    expect(cartProblem(priceCart(addToCart([], only, 1), cat2), "tkl")).toBe("pkmOnly tidak dijual di cabang ini.");
  });

  it("baris pesanan menyalin nama, sku, bonus", () => {
    let n = 0;
    const lines = toOrderLines(priceCart(addToCart(addToCart([], ayam, 1), promo, 1), catalog), productsById, () => `l${++n}`);
    expect(lines[0]).toEqual({
      id: "l1",
      productId: "ayam40",
      name: "ayam40",
      sku: "AS002",
      unit: "ekor",
      quantity: 1,
      price: 40000,
      total: 40000,
      consumed: [{ stockItemId: "ayam", qty: 1 }],
    });
    expect(lines[1].freeItems).toEqual([{ productId: "hati", name: "hati", qty: 1 }]);
    expect(lines[1].consumed).toEqual([
      { stockItemId: "ayam", qty: 1 },
      { stockItemId: "hati", qty: 1 },
    ]);
  });

  it("produk di kasir mengikuti kategori tersembunyi, cabang, dan fitur", () => {
    const inHidden = p({ id: "x", categoryId: "musiman" });
    const elsewhere = p({ id: "y", branchIds: ["pkm"] });
    const all = [ayam, kaki, paket, inHidden, elsewhere];
    const ids = (f: Partial<Parameters<typeof sellableProducts>[1]>) =>
      sellableProducts(all, { branchId: "tkl", hiddenCategoryIds: new Set(["musiman"]), weightSales: true, bundles: true, ...f }).map((x) => x.id);
    expect(ids({})).toEqual(["ayam40", "kaki", "paket"]);
    expect(ids({ hiddenCategoryIds: new Set() })).toEqual(["ayam40", "kaki", "paket", "x"]);
    expect(ids({ weightSales: false, bundles: false })).toEqual(["ayam40"]);
  });

  it("fitur produk yang mati berhenti berlaku di kasir tanpa mengubah produk asli", () => {
    const on = { stockTracking: true, branchPricing: true, freeItems: true };
    const cabang = p({ id: "cabang", price: 40000, priceByBranch: { tkl: 45000 } });
    expect(tillProduct(promo, on)).toBe(promo);

    // Hitung stok mati: tidak ada konsumsi, termasuk opsi paket dan bonus.
    const noStock = new Map([ayam, hati, promo, paket].map((x) => [x.id, tillProduct(x, { ...on, stockTracking: false })]));
    const noStockCatalog = { ...catalog, productsById: noStock };
    const cart = addToCart(
      addToCart([], noStock.get("promo")!, 1),
      noStock.get("paket")!,
      1,
      [{ groupId: "g", optionId: "u40", label: "40K", count: 3 }],
    );
    const priced = priceCart(cart, noStockCatalog);
    expect(priced.map((l) => l.consumed)).toEqual([[], []]);
    expect(promo.consumes).toEqual([{ stockItemId: "ayam", qty: 1 }]);
    expect(paket.choiceGroups![0].options[0].consumes).toEqual([{ stockItemId: "ayam40", qty: 1 }]);

    // Harga per cabang mati: harga dasar.
    const priceOf = (x: Product) => priceCart(addToCart([], x, 1), { ...catalog, productsById: new Map([[x.id, x]]) })[0].price;
    expect(priceOf(cabang)).toBe(45000);
    expect(priceOf(tillProduct(cabang, { ...on, branchPricing: false }))).toBe(40000);
    expect(cabang.priceByBranch).toEqual({ tkl: 45000 });

    // Bonus mati: tidak ada bonus di pesanan dan stoknya tidak terpotong.
    const noBonus = new Map([hati, promo].map((x) => [x.id, tillProduct(x, { ...on, freeItems: false })]));
    const lines = toOrderLines(priceCart(addToCart([], noBonus.get("promo")!, 1), { ...catalog, productsById: noBonus }), noBonus, () => "l1");
    expect(lines[0].freeItems).toBeUndefined();
    expect(lines[0].consumed).toEqual([{ stockItemId: "ayam", qty: 1 }]);
    expect(promo.freeItems).toEqual([{ productId: "hati", qty: 1 }]);
  });

  it("saran uang tunai", () => {
    expect(cashSuggestions(37500)).toEqual([37500, 38000, 40000, 50000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});

describe("buildOrder", () => {
  const items = toOrderLines(priceCart(addToCart([], ayam, 1), catalog), productsById, () => "l1");
  const base = {
    id: "o1",
    orderNumber: "20261124-TKLA0001",
    branchId: "tkl",
    deviceLetter: "A",
    items,
    orderType: "instant" as const,
    instantStatus: "completed" as const,
    createdBy: "kasir@demo.local",
    now: "2026-11-24T02:00:00.000Z",
  };

  it("tunai wajib diisi dan tidak boleh kurang", () => {
    expect(buildOrder({ ...base, payment: { method: "cash" } })).toEqual({ ok: false, message: "Isi uang yang diterima." });
    expect(buildOrder({ ...base, payment: { method: "cash", cashReceived: 30000 } }).ok).toBe(false);
    const ok = buildOrder({ ...base, payment: { method: "cash", cashReceived: 50000 } });
    expect(ok.ok && ok.order).toMatchObject({ totalAmount: 40000, cashReceived: 50000, paymentStatus: "paid", orderStatus: "completed" });
  });

  it("transfer tidak menyimpan cashReceived", () => {
    const r = buildOrder({ ...base, payment: { method: "transfer", cashReceived: 50000 } });
    expect(r.ok && "cashReceived" in r.order).toBe(false);
  });

  it("Bayar nanti: tanpa metode, wajib nama", () => {
    expect(buildOrder({ ...base, orderType: "preorder", payment: null }).ok).toBe(false);
    const r = buildOrder({ ...base, orderType: "preorder", payment: null, customerName: " Budi " });
    expect(r.ok && r.order).toMatchObject({ paymentStatus: "unpaid", orderStatus: "pending", customerName: "Budi" });
    expect(r.ok && "paymentMethod" in r.order).toBe(false);
  });

  it("pesanan langsung tanpa bayar ditolak", () => {
    expect(buildOrder({ ...base, payment: null }).ok).toBe(false);
  });

  it("status awal pesanan langsung mengikuti config", () => {
    const r = buildOrder({ ...base, instantStatus: "pending", payment: { method: "qris" } });
    expect(r.ok && r.order.orderStatus).toBe("pending");
  });

  it("terima pembayaran", () => {
    const order = { totalAmount: 40000, paymentStatus: "unpaid" as const };
    expect(collectPaymentPatch(order, "cash", 30000, "x", "t").ok).toBe(false);
    expect(collectPaymentPatch({ ...order, paymentStatus: "paid" }, "qris", undefined, "x", "t").ok).toBe(false);
    const r = collectPaymentPatch(order, "transfer", undefined, "x", "t");
    expect(r.ok && r.patch).toEqual({ paymentStatus: "paid", paymentMethod: "transfer", paidAt: "t", updatedBy: "x", updatedAt: "t" });
  });

  it("filter cabang", () => {
    const orders = [{ branchId: "tkl" }, { branchId: "pkm" }];
    expect(filterByBranch(orders, "all")).toHaveLength(2);
    expect(filterByBranch(orders, "pkm")).toEqual([{ branchId: "pkm" }]);
  });
});
