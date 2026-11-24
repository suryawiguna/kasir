import { describe, expect, it } from "vitest";
import { divRound } from "../../lib/intMath";
import { formatAmount, formatRupiah, parseRupiahInput } from "./money";
import { basePriceFor, lineTotal, unitPriceFor } from "./pricing";

describe("divRound", () => {
  it("setengah ke atas tanpa float", () => {
    expect(divRound(25000 * 1234, 1000)).toBe(30850);
    expect(divRound(1, 2)).toBe(1);
    expect(divRound(3, 2)).toBe(2);
    expect(divRound(1, 3)).toBe(0);
    expect(divRound(-3, 2)).toBe(-2);
  });
});

describe("pricing", () => {
  it("total per berat dibulatkan ke rupiah", () => {
    expect(lineTotal(25000, 1500, 1000)).toBe(37500);
    expect(lineTotal(25000, 1234, 1000)).toBe(30850);
    expect(lineTotal(33333, 1500, 1000)).toBe(50000); // 49999,5 → 50000
    expect(lineTotal(40000, 3, 1)).toBe(120000);
  });

  it("harga cabang menimpa harga dasar", () => {
    const p = { price: 40000, priceByBranch: { pkm: 42000 } };
    expect(basePriceFor(p, "tkl")).toBe(40000);
    expect(basePriceFor(p, "pkm")).toBe(42000);
  });

  it("tambahan harga pilihan per unit", () => {
    const p = { price: 20000 };
    expect(
      unitPriceFor(p, "tkl", [
        { groupId: "g", optionId: "a", label: "Keju", count: 2, priceDelta: 3000 },
        { groupId: "g", optionId: "b", label: "Biasa", count: 1 },
      ]),
    ).toBe(26000);
  });
});

describe("money", () => {
  it("format", () => {
    expect(formatRupiah(25000)).toBe("Rp25.000");
    expect(formatRupiah(-5000)).toBe("-Rp5.000");
    expect(formatAmount(1234567)).toBe("1.234.567");
  });
  it("parse input", () => {
    expect(parseRupiahInput("Rp 25.000")).toBe(25000);
    expect(parseRupiahInput("")).toBeNull();
  });
});
