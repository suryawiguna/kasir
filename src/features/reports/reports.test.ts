import { describe, expect, it } from "vitest";
import type { Branch, Order, OrderLine, StockItem, Unit } from "../../domain/types";
import { isSale, owedIn, saleTime, salesIn } from "./branchScope";
import { salesByBranch } from "./byBranch";
import { percentChange, previousScope } from "./compare";
import { lowStock } from "./lowStock";
import { paymentBreakdown } from "./payments";
import { addDays, reportPeriod } from "./period";
import { summarize } from "./summary";
import { productSales } from "./topProducts";
import { salesTrend } from "./trend";

const TZ = "Asia/Makassar" as const;
// Jumat 27 Nov 2026, 15:30 WITA.
const NOW = new Date("2026-11-27T07:30:00.000Z");
/** Instant UTC untuk jam WITA. */
const wita = (date: string, time: string) => new Date(`${date}T${time}:00.000+08:00`).toISOString();

const UNITS: Unit[] = [
  { code: "ekor", label: "ekor", factor: 1, decimals: 0, step: 1 },
  { code: "kg", label: "kg", baseLabel: "gram", factor: 1000, decimals: 2, step: 0.1 },
];

const BRANCHES: Branch[] = [
  { id: "tkl", name: "Tikala", code: "TKL", active: true, order: 0 },
  { id: "pkm", name: "Perkamil", code: "PKM", active: true, order: 1 },
];

let n = 0;
const line = (productId: string, quantity: number, total: number, unit = "ekor", name = productId): OrderLine => ({
  id: `l${++n}`,
  productId,
  name,
  unit,
  quantity,
  price: total,
  total,
  consumed: [],
});

const order = (o: Partial<Order> & { createdAt: string }): Order => {
  const items = o.items ?? [line("ayam", 1, 50000)];
  return {
    id: `o${++n}`,
    orderNumber: `20261127-TKLA${String(n).padStart(4, "0")}`,
    branchId: "tkl",
    deviceLetter: "A",
    totalAmount: items.reduce((s, l) => s + l.total, 0),
    orderType: "instant",
    orderStatus: "completed",
    paymentStatus: "paid",
    paymentMethod: "cash",
    createdBy: "kasir@x.local",
    ...o,
    items,
  };
};

describe("reportPeriod", () => {
  it("Hari ini: dari tengah malam WITA sampai sekarang, dibanding kemarin sampai jam yang sama", () => {
    const p = reportPeriod("today", TZ, NOW);
    expect(p.from).toBe(wita("2026-11-27", "00:00"));
    expect(p.to).toBe(NOW.toISOString());
    expect(p.prevFrom).toBe(wita("2026-11-26", "00:00"));
    expect(p.prevTo).toBe(wita("2026-11-26", "15:30"));
    expect(p.granularity).toBe("hour");
    expect(p.compareLabel).toBe("dari kemarin");
  });

  it("Kemarin: satu hari penuh, dibanding hari sebelumnya", () => {
    const p = reportPeriod("yesterday", TZ, NOW);
    expect([p.from, p.to, p.prevFrom, p.prevTo]).toEqual([
      wita("2026-11-26", "00:00"),
      wita("2026-11-27", "00:00"),
      wita("2026-11-25", "00:00"),
      wita("2026-11-26", "00:00"),
    ]);
  });

  it("7 dan 30 hari termasuk hari ini; pembanding panjangnya sama", () => {
    const p7 = reportPeriod("7d", TZ, NOW);
    expect(p7.dates).toEqual(["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(p7.prevFrom).toBe(wita("2026-11-14", "00:00"));
    expect(p7.prevTo).toBe(wita("2026-11-20", "15:30"));
    const p30 = reportPeriod("30d", TZ, NOW);
    expect(p30.dates).toHaveLength(30);
    expect(p30.dates[0]).toBe("2026-10-29");
    expect(p30.granularity).toBe("day");
  });

  it("Bulan ini: dari tanggal 1, dibanding bulan lalu sampai hari dan jam yang sama", () => {
    const p = reportPeriod("month", TZ, NOW);
    expect(p.dates[0]).toBe("2026-11-01");
    expect(p.dates).toHaveLength(27);
    expect(p.prevFrom).toBe(wita("2026-10-01", "00:00"));
    expect(p.prevTo).toBe(wita("2026-10-27", "15:30"));
    // 31 Maret: pembanding berhenti di akhir Februari.
    const march = reportPeriod("month", TZ, new Date(wita("2027-03-31", "10:00")));
    expect(march.prevTo).toBe(wita("2027-03-01", "00:00"));
    // 1 Januari: bulan lalu = Desember tahun lalu.
    expect(reportPeriod("month", TZ, new Date(wita("2027-01-01", "08:00"))).prevFrom).toBe(wita("2026-12-01", "00:00"));
  });

  it("batas hari mengikuti zona toko, bukan UTC", () => {
    // 23:30 UTC tanggal 26 = 07:30 WITA tanggal 27.
    const p = reportPeriod("today", TZ, new Date("2026-11-26T23:30:00.000Z"));
    expect(p.dates).toEqual(["2026-11-27"]);
    expect(reportPeriod("today", "Asia/Jakarta", new Date("2026-11-26T23:30:00.000Z")).dates).toEqual(["2026-11-27"]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("branchScope + summarize", () => {
  const today = reportPeriod("today", TZ, NOW);
  const scope = { from: today.from, to: today.to };

  it("batal tidak dihitung, belum dibayar terpisah", () => {
    const orders = [
      order({ createdAt: wita("2026-11-27", "09:00"), items: [line("ayam", 2, 100000)] }),
      order({ createdAt: wita("2026-11-27", "10:00"), items: [line("ayam", 1, 45000)], paymentMethod: "transfer" }),
      order({ createdAt: wita("2026-11-27", "11:00"), orderStatus: "cancelled", cancelledAt: wita("2026-11-27", "11:05") }),
      order({ createdAt: wita("2026-11-27", "12:00"), orderType: "preorder", orderStatus: "pending", paymentStatus: "unpaid", paymentMethod: undefined }),
      // Belum dibayar lalu batal: tidak di mana-mana.
      order({ createdAt: wita("2026-11-27", "13:00"), orderStatus: "cancelled", paymentStatus: "unpaid", paymentMethod: undefined }),
    ];
    expect(summarize(orders, scope)).toEqual({ sales: 145000, transactions: 2, average: 72500, owed: 50000, owedCount: 1 });
  });

  it("tanggal penjualan = paidAt bila ada: dibuat kemarin, dibayar hari ini masuk hari ini", () => {
    const o = order({ createdAt: wita("2026-11-26", "18:00"), paidAt: wita("2026-11-27", "09:00"), orderType: "preorder", paymentMethod: "transfer" });
    expect(saleTime(o)).toBe(o.paidAt);
    expect(summarize([o], scope).sales).toBe(50000);
    expect(summarize([o], previousScope(today)).sales).toBe(0);
  });

  it("batas hari WITA: 23:59 kemarin tidak masuk, 00:00 masuk", () => {
    const orders = [order({ createdAt: wita("2026-11-26", "23:59") }), order({ createdAt: wita("2026-11-27", "00:00") })];
    expect(summarize(orders, scope).transactions).toBe(1);
  });

  it("rata-rata dibulatkan ke rupiah tanpa float; periode kosong = 0", () => {
    const orders = [10000, 10000, 10001].map((t) => order({ createdAt: wita("2026-11-27", "09:00"), items: [line("x", 1, t)] }));
    expect(summarize(orders, scope).average).toBe(10000);
    expect(summarize([], scope)).toEqual({ sales: 0, transactions: 0, average: 0, owed: 0, owedCount: 0 });
  });

  it("filter cabang", () => {
    const orders = [order({ createdAt: wita("2026-11-27", "09:00") }), order({ createdAt: wita("2026-11-27", "09:00"), branchId: "pkm" })];
    expect(salesIn(orders, { ...scope, branchId: "pkm" })).toHaveLength(1);
    expect(salesIn(orders, scope)).toHaveLength(2);
    expect(owedIn(orders, scope)).toHaveLength(0);
    expect(isSale(orders[0])).toBe(true);
  });
});

describe("percentChange", () => {
  it("persen bulat; periode sebelumnya kosong = null", () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(1, 3)).toBe(-67);
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe("salesByBranch", () => {
  const scope = { from: wita("2026-11-27", "00:00"), to: NOW.toISOString() };

  it("penjualan, transaksi, dan porsi per cabang", () => {
    const orders = [
      order({ createdAt: wita("2026-11-27", "09:00"), items: [line("a", 1, 60000)] }),
      order({ createdAt: wita("2026-11-27", "09:00"), items: [line("a", 1, 40000)], branchId: "pkm" }),
      order({ createdAt: wita("2026-11-27", "10:00"), items: [line("a", 1, 99000)], branchId: "pkm", orderStatus: "cancelled" }),
    ];
    expect(salesByBranch(orders, scope, BRANCHES)).toEqual([
      { branchId: "tkl", name: "Tikala", sales: 60000, transactions: 1, share: 60 },
      { branchId: "pkm", name: "Perkamil", sales: 40000, transactions: 1, share: 40 },
    ]);
  });

  it("cabang tanpa penjualan tetap tampil 0; cabang nonaktif hanya bila ada penjualan", () => {
    const branches = [...BRANCHES, { id: "lama", name: "Lama", code: "LMA", active: false, order: 2 }];
    expect(salesByBranch([], scope, branches).map((r) => [r.branchId, r.sales, r.share])).toEqual([
      ["tkl", 0, 0],
      ["pkm", 0, 0],
    ]);
    const rows = salesByBranch([order({ createdAt: wita("2026-11-27", "09:00"), branchId: "lama" })], scope, branches);
    expect(rows.map((r) => r.branchId)).toEqual(["tkl", "pkm", "lama"]);
  });
});

describe("salesTrend", () => {
  it("per hari: setiap hari di rentang, hari kosong = 0, per cabang", () => {
    const p = reportPeriod("7d", TZ, NOW);
    const orders = [
      order({ createdAt: wita("2026-11-21", "08:00"), items: [line("a", 1, 10000)] }),
      order({ createdAt: wita("2026-11-27", "08:00"), items: [line("a", 1, 20000)] }),
      order({ createdAt: wita("2026-11-27", "09:00"), items: [line("a", 1, 5000)], branchId: "pkm" }),
      // 23:30 WITA tanggal 26 = tanggal 26, walau UTC-nya 15:30.
      order({ createdAt: wita("2026-11-26", "23:30"), items: [line("a", 1, 7000)] }),
    ];
    const t = salesTrend(orders, { from: p.from, to: p.to }, p, TZ);
    expect(t.map((b) => b.total)).toEqual([10000, 0, 0, 0, 0, 7000, 25000]);
    expect(t[0].label).toBe("21/11");
    expect(t[6].byBranch).toEqual({ tkl: 20000, pkm: 5000 });
  });

  it("per jam: hanya jam buka (jam pertama sampai terakhir berpenjualan)", () => {
    const p = reportPeriod("today", TZ, NOW);
    const orders = [
      order({ createdAt: wita("2026-11-27", "09:15"), items: [line("a", 1, 10000)] }),
      order({ createdAt: wita("2026-11-27", "12:40"), items: [line("a", 1, 30000)] }),
    ];
    const t = salesTrend(orders, { from: p.from, to: p.to }, p, TZ);
    expect(t.map((b) => [b.label, b.total])).toEqual([
      ["09.00", 10000],
      ["10.00", 0],
      ["11.00", 0],
      ["12.00", 30000],
    ]);
    expect(salesTrend([], { from: p.from, to: p.to }, p, TZ)).toEqual([]);
  });
});

describe("productSales", () => {
  const scope = { from: wita("2026-11-27", "00:00"), to: NOW.toISOString() };

  it("jumlah dalam satuan dasar, produk per berat, urut rupiah atau jumlah", () => {
    const orders = [
      order({ createdAt: wita("2026-11-27", "09:00"), items: [line("ayam", 3, 150000), line("kaki", 1500, 37500, "kg", "Kaki Ayam")] }),
      order({ createdAt: wita("2026-11-27", "10:00"), items: [line("ayam", 2, 100000), line("hati", 12, 30000)] }),
      order({ createdAt: wita("2026-11-27", "11:00"), items: [line("ayam", 50, 9999999)], orderStatus: "cancelled" }),
    ];
    const bySales = productSales(orders, scope, UNITS);
    expect(bySales.map((r) => [r.productId, r.quantity, r.sales])).toEqual([
      ["ayam", 5, 250000],
      ["kaki", 1500, 37500],
      ["hati", 12, 30000],
    ]);
    expect(bySales[1].unit.label).toBe("kg");
    expect(productSales(orders, scope, UNITS, "quantity").map((r) => r.productId)).toEqual(["kaki", "hati", "ayam"]);
  });

  it("pilihan paket tidak jadi produk sendiri; nama dari pesanan terbaru", () => {
    const paket = { ...line("paket", 1, 100000, "ekor", "Paket lama"), choices: [{ groupId: "g", optionId: "40k", label: "40K", count: 3 }] };
    const orders = [
      order({ createdAt: wita("2026-11-27", "09:00"), items: [paket] }),
      order({ createdAt: wita("2026-11-27", "10:00"), items: [{ ...paket, id: "x", name: "Paket Hemat" }] }),
    ];
    const rows = productSales(orders, scope, UNITS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Paket Hemat", quantity: 2, sales: 200000 });
  });
});

describe("paymentBreakdown", () => {
  const scope = { from: wita("2026-11-27", "00:00"), to: NOW.toISOString() };
  const orders = [
    order({ createdAt: wita("2026-11-27", "09:00"), paymentMethod: "cash" }),
    order({ createdAt: wita("2026-11-27", "09:00"), paymentMethod: "cash" }),
    order({ createdAt: wita("2026-11-27", "09:00"), paymentMethod: "qris" }),
    order({ createdAt: wita("2026-11-27", "09:00"), paymentStatus: "unpaid", paymentMethod: undefined }),
  ];

  it("hanya metode aktif, kecuali yang punya penjualan", () => {
    expect(paymentBreakdown(orders, scope, { cash: true, transfer: true, qris: false })).toEqual([
      { method: "cash", count: 2, total: 100000 },
      { method: "transfer", count: 0, total: 0 },
      { method: "qris", count: 1, total: 50000 },
    ]);
    expect(paymentBreakdown([], scope, { cash: true, transfer: false, qris: false }).map((r) => r.method)).toEqual(["cash"]);
  });
});

describe("lowStock", () => {
  const items: StockItem[] = [
    { id: "ayam", name: "Ayam", unit: "ekor", lowAt: 10, active: true, order: 0 },
    { id: "hati", name: "Hati", unit: "ekor", lowAt: 5, active: true, order: 1 },
    { id: "bumbu", name: "Bumbu", unit: "ekor", active: true, order: 2 },
    { id: "lama", name: "Lama", unit: "ekor", lowAt: 5, active: false, order: 3 },
  ];

  it("level <= lowAt menipis, <= 0 habis (habis dulu); cabang yang belum terbaca dilewati", () => {
    const rows = lowStock(items, { tkl: { ayam: 10, hati: 6, bumbu: 3, lama: 0 }, pkm: { ayam: 0, hati: 2, bumbu: 1 } }, BRANCHES);
    expect(rows.map((r) => [r.branchId, r.item.id, r.state])).toEqual([
      ["pkm", "ayam", "empty"],
      ["tkl", "ayam", "low"],
      ["pkm", "hati", "low"],
    ]);
    expect(lowStock(items, { pkm: { ayam: 50, hati: 50, bumbu: 1 } }, BRANCHES)).toEqual([]);
    expect(lowStock(items, { tkl: { ayam: 1, hati: 50, bumbu: 1 }, pkm: { ayam: 1, hati: 50, bumbu: 1 } }, BRANCHES, "pkm")).toHaveLength(1);
  });
});
