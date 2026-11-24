import { describe, expect, it } from "vitest";
import type { Order } from "../../domain/types";
import { PRESET_UNITS } from "../units/units";
import {
  buildReceiptBytes,
  buildReceiptLines,
  encodeReceipt,
  lineText,
  printerRows,
  printerRowSpans,
  toAscii,
  type ReceiptContext,
  type ReceiptLine,
} from "./receipt";

const ctx = (over: Partial<ReceiptContext["config"]["receipt"]> = {}, receiptHeader?: string[]): ReceiptContext => ({
  config: {
    name: "Toko Uji",
    units: PRESET_UNITS,
    timezone: "Asia/Makassar",
    receipt: { header: ["Aneka Ayam", "Jl. Tikala"], footer: ["Terima kasih"], showCustomerName: true, paperWidth: 32, ...over },
  },
  branch: receiptHeader ? { receiptHeader } : undefined,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  orderNumber: "20261124-TKLA0042",
  branchId: "tkl",
  deviceLetter: "A",
  createdAt: "2026-11-24T06:05:00.000Z", // 14:05 WITA
  createdBy: "kasir1@x",
  orderType: "instant",
  orderStatus: "completed",
  paymentStatus: "paid",
  paymentMethod: "cash",
  cashReceived: 100_000,
  totalAmount: 95_000,
  items: [
    {
      id: "a",
      productId: "p1",
      name: "Ayam kampung",
      unit: "kg",
      quantity: 1500,
      price: 50_000,
      total: 75_000,
      consumed: [],
    },
    {
      id: "b",
      productId: "p2",
      name: "Paket hemat",
      unit: "paket",
      quantity: 2,
      price: 10_000,
      total: 20_000,
      consumed: [],
      choices: [{ groupId: "g", optionId: "o", label: "Pedas", count: 2 }],
      freeItems: [{ productId: "p3", name: "Es teh", qty: 1 }],
    },
  ],
  ...over,
});

const texts = (lines: ReceiptLine[]) => lines.flatMap((l) => (l.kind === "text" ? [lineText(l)] : []));
const trimmed = (lines: ReceiptLine[]) => texts(lines).map((t) => t.trim());
/** Kiri dan kanan di satu baris selebar kertas, seperti `cols`. */
const row = (left: string, right: string, width = 32) => (left + right.padStart(width - left.length)).trim();

describe("struk pelanggan", () => {
  it("header, tanggal di zona toko, nomor pendek, item, total, kembalian, footer", () => {
    const t = trimmed(buildReceiptLines(order(), "customer", ctx()).lines);
    expect(t.slice(0, 4)).toEqual(["Aneka Ayam", "Jl. Tikala", "24/11/26 14:05", "A0042"]);
    expect(t).toContain(row("  1,5 kg x 50.000", "Rp75.000"));
    expect(t).toContain("2x Pedas");
    expect(t).toContain("+ Bonus 1x Es teh");
    expect(t).toContain(row("TOTAL", "Rp95.000"));
    expect(t).toContain(row("Tunai", "Rp100.000"));
    expect(t).toContain(row("Kembalian", "Rp5.000"));
    expect(t.at(-1)).toBe("Terima kasih");
  });

  it("setiap baris teks pas lebar kertas", () => {
    for (const width of [32, 48] as const) {
      const r = buildReceiptLines(order(), "customer", ctx({ paperWidth: width }));
      expect(r.width).toBe(width);
      for (const l of r.lines) {
        if (l.kind === "text" && l.size === "normal") expect(lineText(l).length).toBeLessThanOrEqual(width);
      }
      expect(texts(r.lines)).toContain("-".repeat(width));
    }
  });

  it("header cabang menimpa header toko; tanpa header memakai nama toko", () => {
    expect(trimmed(buildReceiptLines(order(), "customer", ctx({}, ["Cabang Perkamil"])).lines)[0]).toBe("Cabang Perkamil");
    expect(trimmed(buildReceiptLines(order(), "customer", ctx({}, [" "])).lines)[0]).toBe("Aneka Ayam");
    expect(trimmed(buildReceiptLines(order(), "customer", ctx({ header: [] })).lines)[0]).toBe("Toko Uji");
  });

  it("nama pelanggan mengikuti pengaturan", () => {
    const o = order({ customerName: "Budi" });
    expect(trimmed(buildReceiptLines(o, "customer", ctx()).lines)).toContain(row("Pelanggan", "Budi"));
    expect(texts(buildReceiptLines(o, "customer", ctx({ showCustomerName: false })).lines).join()).not.toContain("Budi");
  });

  it("belum bayar: tanpa metode dan tanpa tunai, ditandai belum lunas", () => {
    const o = order({ paymentStatus: "unpaid", paymentMethod: undefined, cashReceived: undefined });
    const t = texts(buildReceiptLines(o, "customer", ctx()).lines).join("\n");
    expect(t).toContain("BELUM LUNAS");
    expect(t).not.toContain("Metode bayar");
    expect(t).not.toContain("Kembalian");
  });

  it("transfer: tanpa baris tunai", () => {
    const o = order({ paymentMethod: "transfer", cashReceived: undefined });
    const t = texts(buildReceiptLines(o, "customer", ctx()).lines).join("\n");
    expect(t).toContain("Transfer");
    expect(t).not.toContain("Tunai");
  });

  it("pesanan batal ditandai", () => {
    expect(trimmed(buildReceiptLines(order({ orderStatus: "cancelled" }), "customer", ctx()).lines)).toContain("DIBATALKAN");
  });
});

describe("struk dapur", () => {
  it("nomor, pelanggan, waktu ambil, item dan pilihan, tanpa uang", () => {
    const o = order({ customerName: "Budi", pickupTime: "2026-11-25T10:30" });
    const t = trimmed(buildReceiptLines(o, "kitchen", ctx({ showCustomerName: false })).lines);
    expect(t.slice(0, 2)).toEqual(["A0042", "Budi"]);
    expect(t).toContain("Ambil 25/11/26 10:30");
    expect(t).toContain("1,5 kg Ayam kampung");
    expect(t).toContain("2 paket Paket hemat");
    expect(t).toContain("2x Pedas");
    expect(t.join("\n")).not.toMatch(/Rp|TOTAL/);
  });
});

describe("printer", () => {
  it("non-ASCII jadi ? di baris, sama dengan yang dicetak", () => {
    expect(toAscii("Café 🍗 2×")).toBe("Cafe ?? 2x");
  });

  it("baris dipotong per karakter seperti printer, ketebalan tetap", () => {
    expect(printerRows("a".repeat(40), "normal", 32)).toEqual(["a".repeat(32), "a".repeat(8)]);
    expect(printerRows("a".repeat(20), "double", 32)).toEqual(["a".repeat(16), "a".repeat(4)]);
    const rows = printerRowSpans([{ text: "x".repeat(30), bold: true }, { text: "yyyy", bold: false }], "normal", 32);
    expect(rows[0].map((s) => s.bold)).toEqual([true, false]);
    expect(rows[1]).toEqual([{ text: "yy", bold: false }]);
  });

  it("byte ESC/POS: init, jarak baris, perintah mode hanya saat berubah, potong di akhir", () => {
    const bytes = encodeReceipt({
      width: 32,
      lines: [
        { kind: "text", spans: [{ text: "A", bold: true }], align: "center", size: "double" },
        { kind: "text", spans: [{ text: "B", bold: true }], align: "center", size: "double" },
        { kind: "cut" },
      ],
    });
    expect([...bytes]).toEqual([
      0x1b, 0x40, 0x1b, 0x33, 26,
      0x1b, 0x61, 1, 0x1d, 0x21, 0x11, 0x1b, 0x45, 1, 65, 0x0a,
      66, 0x0a,
      0x1d, 0x56, 66, 0,
    ]);
  });

  it("struk lengkap hanya berisi byte ASCII dan perintah", () => {
    const bytes = buildReceiptBytes(order({ customerName: "Bú 🍗" }), "customer", ctx());
    expect(bytes.every((b) => b < 0x80)).toBe(true);
  });
});
