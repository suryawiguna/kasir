import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBusinessDate } from "../../lib/businessDate";
import { parseOrderNumber } from "../orders/orderNumber";
import { cartProblem } from "../pos/cart";
import { sumTotals } from "../pricing/pricing";
import { applyOverrides, branchesFromNames, seedProblems, type DemoSeed } from "./demoTemplate";
import { generateSampleOrders, hashSeed, mulberry32 } from "./sampleOrders";

const TEMPLATE_DIR = join(__dirname, "../../../clients/kasir-demo/templates");
const loadTemplate = (name: string): DemoSeed => JSON.parse(readFileSync(join(TEMPLATE_DIR, `${name}.json`), "utf8"));
const TEMPLATES = readdirSync(TEMPLATE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

let counter = 0;
const newId = () => `id${++counter}`;
const NOW = new Date("2026-11-26T07:30:00.000Z"); // 15:30 WITA

const generate = (seed: DemoSeed, demoId = "uji", days = 7) =>
  generateSampleOrders({ seed, days, now: NOW, random: mulberry32(hashSeed(demoId)), createdBy: "contoh@kasir-demo.local", newId });

describe("branchesFromNames", () => {
  it("id c1.., kode dari 3 huruf pertama", () => {
    expect(branchesFromNames(["Tikala", "Perkamil"])).toEqual([
      { id: "c1", name: "Tikala", code: "TIK", active: true, order: 0 },
      { id: "c2", name: "Perkamil", code: "PER", active: true, order: 1 },
    ]);
  });

  it("kode unik walau nama mirip; nama aneh tetap punya kode valid", () => {
    const codes = branchesFromNames(["Cabang 1", "Cabang 2", "Cabang 3", "  ", "Ö", "Mall Ratu"]).map((b) => b.code);
    expect(codes).toEqual(["CAB", "CA2", "CA3", "C4", "MAL"]);
    for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{2,6}$/);
  });

  it("kode bisa ditulis sendiri: Lapak Tikala:TKL", () => {
    expect(branchesFromNames(["Lapak Tikala:TKL", "Lapak Perkamil:pkm"]).map((b) => [b.name, b.code])).toEqual([
      ["Lapak Tikala", "TKL"],
      ["Lapak Perkamil", "PKM"],
    ]);
    // Kode otomatis tidak bentrok dengan kode tulisan sendiri.
    expect(branchesFromNames(["Pusat:TIK", "Tikala"]).map((b) => b.code)).toEqual(["TIK", "TI2"]);
    expect(() => branchesFromNames(["Tikala:T"])).toThrow(/2-6/);
    expect(() => branchesFromNames(["A:TKL", "B:TKL"])).toThrow(/dua kali/);
    expect(() => branchesFromNames([":TKL"])).toThrow(/kosong/);
  });

  it("template ayam = menu Aneka Ayam Manado (kode produk, harga, satuan)", () => {
    const t = loadTemplate("ayam");
    expect(t.features.sku).toBe(true);
    const row = (id: string) => {
      const p = t.products.find((x) => x.id === id)!;
      return [p.sku, p.name, p.price, p.unit];
    };
    expect(["as001", "as002", "as003", "as004", "as005"].map(row)).toEqual([
      ["AS001", "Ayam Segar 35K", 35000, "ekor"],
      ["AS002", "Ayam Segar 40K", 40000, "ekor"],
      ["AS003", "Ayam Segar 45K", 45000, "ekor"],
      ["AS004", "Ayam Segar 50K", 50000, "ekor"],
      ["AS005", "Ayam Segar 55K", 55000, "ekor"],
    ]);
    const pakets = t.products.filter((p) => p.categoryId === "paket-hemat");
    expect(pakets.map((p) => [p.name, p.price, p.consumes])).toEqual(
      [100, 110, 120, 130, 150].map((k) => [`Paket Hemat ${k}K`, k * 1000, [{ stockItemId: "ayam", qty: 3 }]]),
    );
    expect(row("hati").slice(1)).toEqual(["Hati Ayam", 2500, "pasang"]);
    expect(row("kaki").slice(1)).toEqual(["Kaki Ayam", 25000, "kg"]);
  });
});

describe("template", () => {
  it.each(TEMPLATES)("%s valid untuk aplikasi", (name) => {
    expect(seedProblems(loadTemplate(name))).toEqual([]);
  });

  it("dimsum, ayam, cafe, salon tersedia", () => {
    expect(TEMPLATES.sort()).toEqual(["ayam", "cafe", "dimsum", "salon"]);
  });
});

describe("applyOverrides", () => {
  it("nama toko, warna, dan cabang dari argumen; stok cabang dipetakan berurutan", () => {
    const t = loadTemplate("ayam");
    const seed = applyOverrides(t, { name: "Aneka Ayam Manado", color: "#B45309", branchNames: ["Tikala", "Perkamil", "Paal Dua"] });
    expect(seed.config.name).toBe("Aneka Ayam Manado");
    expect(seed.config.receipt.header[0]).toBe("Aneka Ayam Manado");
    expect(seed.config.brandColor).toBe("#b45309");
    expect(seed.branches.map((b) => [b.id, b.code])).toEqual([
      ["c1", "TIK"],
      ["c2", "PER"],
      ["c3", "PAA"],
    ]);
    expect(seed.inventory.c1).toEqual(t.inventory[t.branches[0].id]);
    expect(seed.inventory.c2).toEqual(t.inventory[t.branches[1].id]);
    expect(seed.inventory.c3).toEqual(t.inventory[t.branches[0].id]);
    expect(seedProblems(seed)).toEqual([]);
    // Template tidak berubah.
    expect(t.config.name).toBe("Toko Ayam Contoh");
  });

  it("cabang per produk dan harga cabang ikut dipetakan", () => {
    const t = loadTemplate("dimsum");
    t.products[0] = { ...t.products[0], branchIds: ["c2"], priceByBranch: { c2: 21000 } };
    const seed = applyOverrides(t, { branchNames: ["Satu"] });
    expect(seed.products[0].branchIds).toBeUndefined();
    expect(seed.products[0].priceByBranch).toBeUndefined();
    const two = applyOverrides(t, { branchNames: ["Satu", "Dua"] });
    expect(two.products[0].branchIds).toEqual(["c2"]);
    expect(two.products[0].priceByBranch).toEqual({ c2: 21000 });
  });

  it("warna salah ditolak", () => {
    expect(() => applyOverrides(loadTemplate("cafe"), { color: "merah" })).toThrow(/#RRGGBB/);
  });

  it("--products: daftar produk dibuat aman, stok sendiri dapat item stok", () => {
    const seed = applyOverrides(loadTemplate("dimsum"), {
      products: [
        { id: "bakpao", name: "Bakpao Ayam", price: 12000, unit: "pcs", stockMode: "own" },
        { id: "kopi", name: "Kopi", price: 8000, unit: "gelas", categoryId: "tidak-ada" },
        { id: "susu", name: "Susu", price: 9000, unit: "pcs", stockMode: "shared", consumes: [{ stockItemId: "hilang", qty: 1 }] },
      ],
    });
    expect(seedProblems(seed)).toEqual([]);
    const [bakpao, kopi, susu] = seed.products;
    expect(bakpao.consumes).toEqual([{ stockItemId: "own-bakpao", qty: 1 }]);
    expect(seed.stockItems.some((s) => s.id === "own-bakpao" && s.ownerProductId === "bakpao")).toBe(true);
    expect(seed.inventory.c1["own-bakpao"]).toBe(50);
    expect(kopi.unit).toBe("pcs");
    expect(kopi.categoryId).toBeUndefined();
    expect(kopi.stockMode).toBe("none");
    expect(susu.stockMode).toBe("none");
    expect(susu.consumes).toBeUndefined();
  });

  it("--products tanpa harga bulat ditolak", () => {
    expect(() => applyOverrides(loadTemplate("dimsum"), { products: [{ id: "x", name: "X", price: 1.5, unit: "pcs" }] })).toThrow(/bulat/);
    expect(() => applyOverrides(loadTemplate("dimsum"), { products: { nope: 1 } })).toThrow();
  });
});

describe("generateSampleOrders", () => {
  it.each(TEMPLATES)("%s: pesanan berbentuk sama dengan kasir, stok tidak minus", (name) => {
    const seed = loadTemplate(name);
    const { orders, inventory } = generate(seed, name);
    expect(orders.length).toBeGreaterThan(0);
    const productsById = new Map(seed.products.map((p) => [p.id, p]));
    for (const o of orders) {
      expect(o.items.length).toBeGreaterThan(0);
      expect(o.totalAmount).toBe(sumTotals(o.items));
      expect(o.paymentStatus === "paid").toBe(o.paymentMethod !== undefined);
      if (o.cashReceived !== undefined) expect(o.cashReceived).toBeGreaterThanOrEqual(o.totalAmount);
      if (o.orderType === "preorder") expect(o.customerName).toBeTruthy();
      for (const line of o.items) {
        expect(Number.isInteger(line.total)).toBe(true);
        expect(productsById.has(line.productId)).toBe(true);
      }
      expect(
        cartProblem(
          o.items.map((l) => ({ ...l, key: l.id, product: productsById.get(l.productId)!, unit: seed.config.units[0], consumed: l.consumed })),
          o.branchId,
        ),
      ).toBeNull();
    }
    for (const levels of Object.values(inventory)) for (const v of Object.values(levels)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("7 hari, jam buka, nomor urut per cabang tidak bentrok, tidak ada pesanan di masa depan", () => {
    const seed = loadTemplate("ayam");
    const { orders } = generate(seed);
    const dates = new Set(orders.map((o) => getBusinessDate("Asia/Makassar", o.createdAt)));
    expect(dates.size).toBe(7);
    expect(orders.every((o) => new Date(o.createdAt) < NOW)).toBe(true);
    for (const o of orders) {
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", hour12: false }).format(new Date(o.createdAt)));
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(20);
    }
    const numbers = orders.map((o) => o.orderNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const branch of seed.branches) {
      const seqs = orders.filter((o) => o.branchId === branch.id).map((o) => parseOrderNumber(o.orderNumber)!);
      expect(seqs.every((p) => p.branchCode === branch.code)).toBe(true);
      expect(seqs.map((p) => p.sequence)).toEqual(seqs.map((_, i) => i + 1));
      // 8-20 per hari per cabang (hari ini terpotong jam sekarang).
      const perDay = new Map<string, number>();
      for (const o of orders.filter((x) => x.branchId === branch.id)) {
        const d = getBusinessDate("Asia/Makassar", o.createdAt);
        perDay.set(d, (perDay.get(d) ?? 0) + 1);
      }
      for (const [d, n] of perDay) if (d !== "2026-11-26") expect(n).toBeGreaterThanOrEqual(seed.sampleOrdersPerDay?.[0] ?? 8);
    }
  });

  it("campuran tunai/transfer, sebagian batal, yang lalu selesai", () => {
    const { orders } = generate(loadTemplate("dimsum"), "campur", 7);
    const methods = new Set(orders.map((o) => o.paymentMethod).filter(Boolean));
    expect(methods.has("cash") && methods.has("transfer")).toBe(true);
    expect(orders.some((o) => o.orderStatus === "cancelled" && o.cancelledAt && o.cancelledBy)).toBe(true);
    const past = orders.filter((o) => getBusinessDate("Asia/Makassar", o.createdAt) !== "2026-11-26");
    expect(past.every((o) => o.orderStatus === "completed" || o.orderStatus === "cancelled")).toBe(true);
    expect(past.every((o) => o.paymentStatus === "paid")).toBe(true);
  });

  it("stok = sisa stok di template, tidak pernah habis", () => {
    const seed = loadTemplate("ayam");
    const { inventory } = generate(seed, "stok", 7);
    for (const b of seed.branches) expect(inventory[b.id]).toEqual(seed.inventory[b.id]);
    expect(seedProblems({ ...seed, inventory: { ...seed.inventory, c2: { ...seed.inventory.c2, ayam: 0 } } })).toContain(
      "Stok ayam di cabang c2 kosong atau sudah menipis.",
    );
  });

  it("bisa diulang: id demo sama, hasil sama", () => {
    const seed = loadTemplate("cafe");
    counter = 0;
    const a = generate(seed, "sama").orders.map((o) => [o.orderNumber, o.totalAmount]);
    counter = 0;
    const b = generate(seed, "sama").orders.map((o) => [o.orderNumber, o.totalAmount]);
    expect(a).toEqual(b);
  });
});
