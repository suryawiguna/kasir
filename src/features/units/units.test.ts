import { describe, expect, it } from "vitest";
import { findUnit, formatQuantity, parseQuantityInput, PRESET_UNITS, stepBase, toBase, unitCodeFromLabel, validateUnit } from "./units";

const kg = findUnit(PRESET_UNITS, "kg");
const ekor = findUnit(PRESET_UNITS, "ekor");

describe("units", () => {
  it("konversi tampil ↔ dasar", () => {
    expect(toBase(1.5, kg)).toBe(1500);
    expect(toBase(0.1 + 0.2, kg)).toBe(300); // float 0.30000000000000004
    expect(formatQuantity(1500, kg)).toBe("1,5 kg");
    expect(formatQuantity(1234, kg)).toBe("1,23 kg");
    expect(formatQuantity(3, ekor)).toBe("3 ekor");
    expect(formatQuantity(12000, findUnit(PRESET_UNITS, "pcs"))).toBe("12.000 pcs");
  });

  it("parse input kasir", () => {
    expect(parseQuantityInput("1,5", kg)).toBe(1500);
    expect(parseQuantityInput("1.5", kg)).toBe(1500);
    expect(parseQuantityInput(" 2 ", kg)).toBe(2000);
    expect(parseQuantityInput("1.000", ekor)).toBe(1000);
    expect(parseQuantityInput("1.234,5", findUnit(PRESET_UNITS, "liter"))).toBe(1234500);
    expect(parseQuantityInput("0", kg)).toBeNull();
    expect(parseQuantityInput("-1", kg)).toBeNull();
    expect(parseQuantityInput("abc", kg)).toBeNull();
    expect(parseQuantityInput("", kg)).toBeNull();
    expect(parseQuantityInput("0,0001", kg)).toBeNull(); // di bawah 1 gram
  });

  it("step dalam satuan dasar", () => {
    expect(stepBase(kg)).toBe(100);
    expect(stepBase(ekor)).toBe(1);
  });

  it("satuan tak dikenal jatuh ke faktor 1 tanpa error", () => {
    expect(findUnit(PRESET_UNITS, "ikat")).toEqual({ code: "ikat", label: "ikat", factor: 1, decimals: 0, step: 1 });
  });

  it("validasi satuan buatan pemilik", () => {
    const ikat = { code: unitCodeFromLabel(" Ikat Besar "), label: "ikat besar", factor: 1, decimals: 0, step: 1 };
    expect(ikat.code).toBe("ikat-besar");
    expect(validateUnit(ikat, PRESET_UNITS)).toBeNull();
    expect(validateUnit({ ...ikat, code: "kg" }, PRESET_UNITS)).toBe('Kode "kg" sudah dipakai.');
    expect(validateUnit({ ...ikat, factor: 0.5 }, PRESET_UNITS)).toBe("Faktor harus bilangan bulat ≥ 1.");
  });
});
