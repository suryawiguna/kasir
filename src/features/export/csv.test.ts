import { describe, expect, it } from "vitest";
import type { Branch, Order, Unit } from "../../domain/types";
import { buildReportCsv, csvCell, REPORT_CSV_HEADER } from "./csv";

const UNITS: Unit[] = [
  { code: "ekor", label: "ekor", factor: 1, decimals: 0, step: 1 },
  { code: "kg", label: "kg", baseLabel: "gram", factor: 1000, decimals: 2, step: 0.1 },
];
const BRANCHES: Branch[] = [
  { id: "tkl", name: "Tikala", code: "TKL", active: true, order: 0 },
  { id: "pkm", name: "Perkamil", code: "PKM", active: true, order: 1 },
];

const base = (o: Partial<Order>): Order => ({
  id: "x",
  orderNumber: "20261127-TKLA0001",
  branchId: "tkl",
  deviceLetter: "A",
  items: [],
  totalAmount: 0,
  orderType: "instant",
  orderStatus: "completed",
  paymentStatus: "paid",
  paymentMethod: "cash",
  createdAt: "2026-11-27T01:00:00.000Z",
  createdBy: "k@x.local",
  ...o,
});

describe("csvCell", () => {
  it("kutip bila perlu, rumus dinetralkan, No. HP dibiarkan", () => {
    expect(csvCell('Bu "Rina", Tikala')).toBe('"Bu ""Rina"", Tikala"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+62 812-3456")).toBe("+62 812-3456");
    expect(csvCell(1.5)).toBe("1.5");
  });
});

describe("buildReportCsv", () => {
  const scope = { from: "2026-11-26T16:00:00.000Z", to: "2026-11-27T16:00:00.000Z" };
  const orders: Order[] = [
    base({
      id: "a",
      customerName: "=cmd",
      items: [
        { id: "1", productId: "ayam", name: "Ayam 45K", unit: "ekor", quantity: 2, price: 45000, total: 90000, consumed: [] },
        { id: "2", productId: "kaki", name: "Kaki Ayam", unit: "kg", quantity: 1500, price: 25000, total: 37500, consumed: [] },
      ],
      totalAmount: 127500,
    }),
    base({
      id: "b",
      orderNumber: "20261127-PKMB0007",
      branchId: "pkm",
      orderType: "preorder",
      orderStatus: "pending",
      paymentStatus: "unpaid",
      paymentMethod: undefined,
      createdAt: "2026-11-27T03:00:00.000Z",
      items: [
        {
          id: "3",
          productId: "paket",
          name: "Paket Hemat",
          unit: "ekor",
          quantity: 1,
          price: 120000,
          total: 120000,
          consumed: [],
          choices: [{ groupId: "g", optionId: "40", label: "40K", count: 3 }],
        },
      ],
      totalAmount: 120000,
    }),
    base({ id: "c", orderStatus: "cancelled", items: [{ id: "4", productId: "ayam", name: "Batal", unit: "ekor", quantity: 1, price: 1, total: 1, consumed: [] }] }),
  ];

  it("satu baris per item, kolom Cabang dan Satuan, tanpa pesanan batal", () => {
    const csv = buildReportCsv(orders, scope, { branches: BRANCHES, units: UNITS, timezone: "Asia/Makassar" });
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines[0]).toBe(REPORT_CSV_HEADER.join(","));
    expect(REPORT_CSV_HEADER).toContain("Cabang");
    expect(REPORT_CSV_HEADER).toContain("Satuan");
    expect(lines.slice(1)).toEqual([
      "2026-11-27,09:00,Tikala,TKL-A0001,'=cmd,Ayam 45K,,2,ekor,45000,90000,Lunas,Tunai,Selesai",
      "2026-11-27,09:00,Tikala,TKL-A0001,'=cmd,Kaki Ayam,,1.5,kg,25000,37500,Lunas,Tunai,Selesai",
      "2026-11-27,11:00,Perkamil,PKM-B0007,,Paket Hemat,3× 40K,1,ekor,120000,120000,Belum bayar,,Diproses",
    ]);
  });

  it("filter cabang", () => {
    const csv = buildReportCsv(orders, { ...scope, branchId: "pkm" }, { branches: BRANCHES, units: UNITS, timezone: "Asia/Makassar" });
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  });
});
