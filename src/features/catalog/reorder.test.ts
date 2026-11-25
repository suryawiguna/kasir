import { describe, expect, it } from "vitest";
import { moveId, orderChanges, reorderWithin } from "./reorder";

describe("urutan produk", () => {
  it("memindahkan satu id", () => {
    expect(moveId(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], "b", 99)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b"], "x", 0)).toEqual(["a", "b"]);
  });

  it("urutan satu kategori mengisi posisi yang sama di daftar penuh", () => {
    // Kategori: a, c, e. Produk lain (b, d) tetap di tempatnya.
    expect(reorderWithin(["a", "b", "c", "d", "e"], ["e", "a", "c"])).toEqual(["e", "b", "a", "d", "c"]);
    expect(reorderWithin(["a", "b", "c"], ["c", "b", "a"])).toEqual(["c", "b", "a"]);
    // Sebagian berisi id asing atau ganda: tidak diubah.
    expect(reorderWithin(["a", "b"], ["b", "x"])).toEqual(["a", "b"]);
    expect(reorderWithin(["a", "b"], ["b", "b"])).toEqual(["a", "b"]);
  });

  it("hanya menulis order yang berubah, dinormalkan ke 0..n-1", () => {
    const current = [
      { id: "a", order: 0 },
      { id: "b", order: 5 },
      { id: "c", order: 2 },
    ];
    expect(orderChanges(current, ["a", "c", "b"])).toEqual([
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ]);
    expect(orderChanges([{ id: "a", order: 0 }], ["a"])).toEqual([]);
  });
});
