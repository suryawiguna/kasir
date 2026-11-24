import { describe, expect, it } from "vitest";
import { buildOrderNumber, formatOrderNumberShort, matchesOrderNumber, nextSequence, parseOrderNumber } from "./orderNumber";

describe("orderNumber", () => {
  it("format simpan dan tampil", () => {
    const n = buildOrderNumber("20261124", "TKL", "A", 42);
    expect(n).toBe("20261124-TKLA0042");
    expect(formatOrderNumberShort(n)).toBe("A0042");
    expect(formatOrderNumberShort(n, true)).toBe("TKL-A0042");
    expect(formatOrderNumberShort("asing")).toBe("asing");
  });

  it("parse kode cabang dengan angka", () => {
    expect(parseOrderNumber("20261124-TK1B10000")).toEqual({
      date: "20261124",
      branchCode: "TK1",
      deviceLetter: "B",
      sequence: 10000,
    });
  });

  it("urutan per cabang + perangkat, tidak di-reset harian", () => {
    const orders = [
      { orderNumber: "20261120-TKLA0007" },
      { orderNumber: "20261124-TKLB0099" }, // perangkat lain
      { orderNumber: "20261124-PKMA0500" }, // cabang lain
      { orderNumber: "rusak" },
      {},
    ];
    expect(nextSequence(orders, "TKL", "A")).toBe(8);
    expect(nextSequence(orders, "TKL", "B")).toBe(100);
    expect(nextSequence(orders, "PKM", "A")).toBe(501);
    expect(nextSequence(orders, "PKM", "B")).toBe(1);
  });

  it("dua perangkat di dua cabang tidak pernah bentrok", () => {
    const seen = new Set<string>();
    const orders: { orderNumber: string }[] = [];
    for (let i = 0; i < 50; i++) {
      for (const [code, letter] of [["TKL", "A"], ["TKL", "B"], ["PKM", "A"]] as const) {
        const n = buildOrderNumber("20261124", code, letter, nextSequence(orders, code, letter));
        expect(seen.has(n)).toBe(false);
        seen.add(n);
        orders.push({ orderNumber: n });
      }
    }
  });

  it("urutan terakhir dari perangkat menang atas jendela memori", () => {
    expect(nextSequence([{ orderNumber: "20261124-TKLA0003" }], "TKL", "A", 40)).toBe(41);
    expect(nextSequence([{ orderNumber: "20261124-TKLA0050" }], "TKL", "A", 40)).toBe(51);
  });

  it("menolak bagian yang tidak valid", () => {
    expect(() => buildOrderNumber("2026112", "TKL", "A", 1)).toThrow();
    expect(() => buildOrderNumber("20261124", "tk", "A", 1)).toThrow();
    expect(() => buildOrderNumber("20261124", "TKL", "AA", 1)).toThrow();
  });

  it("pencarian nomor", () => {
    const n = "20261124-TKLA0042";
    expect(matchesOrderNumber(n, "a0042")).toBe(true);
    expect(matchesOrderNumber(n, "TKL-A0042")).toBe(true);
    expect(matchesOrderNumber(n, "#A0042")).toBe(true);
    expect(matchesOrderNumber(n, "B0042")).toBe(false);
    expect(matchesOrderNumber(n, "")).toBe(false);
  });
});
