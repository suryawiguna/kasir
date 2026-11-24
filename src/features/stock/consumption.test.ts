import { describe, expect, it } from "vitest";
import type { LineChoice, Product, StockItem } from "../../domain/types";
import { PRESET_UNITS } from "../units/units";
import {
  choicesKey,
  consumesForMode,
  consumptionForLine,
  deductionDelta,
  editDelta,
  findShortages,
  fitsInStock,
  mergeConsumes,
  ownStockItemId,
  restoreDelta,
  stockLevelState,
  togglePick,
  totalConsumed,
  validateChoices,
} from "./consumption";

const product = (over: Partial<Product> & Pick<Product, "id">): Product => ({
  name: over.id,
  price: 10000,
  unit: "ekor",
  soldBy: "count",
  stockMode: "shared",
  active: true,
  order: 0,
  ...over,
});

const stock: StockItem[] = [
  { id: "ayam", name: "Ayam utuh", unit: "ekor", active: true, order: 0 },
  { id: "hati", name: "Hati ayam", unit: "pasang", active: true, order: 1 },
  { id: "kaki", name: "Kaki ayam", unit: "kg", active: true, order: 2, lowAt: 1000 },
];

/* Setup A: stok total ekor (PLAN §10). */
const ayam40 = product({ id: "as002", price: 40000, consumes: [{ stockItemId: "ayam", qty: 1 }] });
const paketTetap = product({ id: "ph120", price: 120000, unit: "paket", consumes: [{ stockItemId: "ayam", qty: 3 }] });
const kaki = product({
  id: "kaki",
  price: 25000,
  unit: "kg",
  soldBy: "weight",
  consumes: [{ stockItemId: "kaki", qty: 1000 }],
});

/* Setup B: stok per ukuran, paket dipilih saat jual. */
const sizes = [35, 40, 45, 50, 55];
const paketPilih = product({
  id: "ph120",
  price: 120000,
  unit: "paket",
  stockMode: "none",
  choiceGroups: [
    {
      id: "g-ayam",
      label: "Pilih 3 ayam",
      min: 3,
      max: 3,
      allowRepeat: true,
      options: sizes.map((s) => ({
        id: `u${s}`,
        label: `Ukuran ${s}K`,
        consumes: [{ stockItemId: `ayam${s}`, qty: 1 }],
      })),
    },
  ],
});

describe("mergeConsumes", () => {
  it("jumlahkan per item dan buang nol", () => {
    expect(
      mergeConsumes(
        [{ stockItemId: "a", qty: 2 }, { stockItemId: "b", qty: 1 }],
        [{ stockItemId: "a", qty: 3 }, { stockItemId: "b", qty: -1 }],
      ),
    ).toEqual([{ stockItemId: "a", qty: 5 }]);
  });
});

describe("consumptionForLine: Setup A", () => {
  it("produk biasa memotong 1 ekor per unit", () => {
    expect(consumptionForLine({ product: ayam40, quantity: 2, factor: 1 })).toEqual([{ stockItemId: "ayam", qty: 2 }]);
  });

  it("paket tetap memotong 3 ekor per paket", () => {
    expect(consumptionForLine({ product: paketTetap, quantity: 2, factor: 1 })).toEqual([
      { stockItemId: "ayam", qty: 6 },
    ]);
  });

  it("produk per berat memotong gram sesuai timbangan", () => {
    // 1,5 kg disimpan 1500 gram
    expect(consumptionForLine({ product: kaki, quantity: 1500, factor: 1000 })).toEqual([
      { stockItemId: "kaki", qty: 1500 },
    ]);
  });

  it("stok item beda satuan dengan produk tetap diskalakan dan dibulatkan", () => {
    const kakiPcs = product({ ...kaki, consumes: [{ stockItemId: "kakiPcs", qty: 20 }] }); // 20 pcs per kg
    expect(consumptionForLine({ product: kakiPcs, quantity: 1234, factor: 1000 })).toEqual([
      { stockItemId: "kakiPcs", qty: 25 }, // 24,68 → 25
    ]);
  });

  it("mode tidak dilacak tidak memotong apa pun, walau consumes masih tersisa", () => {
    const jasa = product({ id: "jasa", stockMode: "none", consumes: [{ stockItemId: "ayam", qty: 1 }] });
    expect(consumptionForLine({ product: jasa, quantity: 5, factor: 1 })).toEqual([]);
  });
});

describe("consumptionForLine: Setup B (pilihan)", () => {
  it("paket dengan pilihan memotong item stok setiap ukuran yang dipilih", () => {
    const choices: LineChoice[] = [
      { groupId: "g-ayam", optionId: "u40", label: "Ukuran 40K", count: 2 },
      { groupId: "g-ayam", optionId: "u55", label: "Ukuran 55K", count: 1 },
    ];
    expect(consumptionForLine({ product: paketPilih, quantity: 2, factor: 1, choices })).toEqual([
      { stockItemId: "ayam40", qty: 4 },
      { stockItemId: "ayam55", qty: 2 },
    ]);
  });

  it("pilihan pada produk bermode shared ditambahkan ke consumes dasarnya", () => {
    const pedas = product({
      id: "goreng",
      consumes: [{ stockItemId: "ayam", qty: 1 }],
      choiceGroups: [
        {
          id: "saus",
          label: "Saus",
          min: 0,
          max: 1,
          allowRepeat: false,
          options: [{ id: "sambal", label: "Sambal", consumes: [{ stockItemId: "sambal", qty: 30 }] }],
        },
      ],
    });
    const choices = [{ groupId: "saus", optionId: "sambal", label: "Sambal", count: 1 }];
    expect(consumptionForLine({ product: pedas, quantity: 2, factor: 1, choices })).toEqual([
      { stockItemId: "ayam", qty: 2 },
      { stockItemId: "sambal", qty: 60 },
    ]);
  });

  it("opsi yang sudah dihapus dari produk dilewati", () => {
    const choices = [{ groupId: "g-ayam", optionId: "hilang", label: "?", count: 3 }];
    expect(consumptionForLine({ product: paketPilih, quantity: 1, factor: 1, choices })).toEqual([]);
  });
});

describe("bonus", () => {
  it("bonus memotong stok produk bonusnya", () => {
    const hati = product({ id: "hati", unit: "pasang", price: 2500, consumes: [{ stockItemId: "hati", qty: 1 }] });
    const promo = product({ ...ayam40, freeItems: [{ productId: "hati", qty: 2 }] });
    const productsById = new Map([[hati.id, hati]]);
    expect(consumptionForLine({ product: promo, quantity: 3, factor: 1, productsById })).toEqual([
      { stockItemId: "ayam", qty: 3 },
      { stockItemId: "hati", qty: 6 },
    ]);
  });

  it("bonus ke diri sendiri tidak dihitung dua kali", () => {
    const loop = product({ ...ayam40, freeItems: [{ productId: ayam40.id, qty: 1 }] });
    const productsById = new Map([[loop.id, loop]]);
    expect(consumptionForLine({ product: loop, quantity: 1, factor: 1, productsById })).toEqual([
      { stockItemId: "ayam", qty: 1 },
    ]);
  });
});

describe("delta stok", () => {
  const consumed = [
    { stockItemId: "ayam", qty: 3 },
    { stockItemId: "hati", qty: 2 },
  ];

  it("checkout memotong, batal mengembalikan jumlah yang sama", () => {
    expect(deductionDelta(consumed)).toEqual({ ayam: -3, hati: -2 });
    expect(restoreDelta(consumed)).toEqual({ ayam: 3, hati: 2 });
  });

  it("Ubah Item hanya memindahkan selisih dari snapshot", () => {
    const after = [
      { stockItemId: "ayam", qty: 1 },
      { stockItemId: "kaki", qty: 500 },
    ];
    expect(editDelta(consumed, after)).toEqual({ ayam: 2, hati: 2, kaki: -500 });
  });

  it("ganti mode stok setelah ada pesanan: batal tetap memakai snapshot lama", () => {
    // Pesanan dibuat saat Setup A (memotong 'ayam').
    const lines = [{ consumed: consumptionForLine({ product: paketTetap, quantity: 1, factor: 1 }) }];
    // Pemilik pindah ke Setup B; produk sekarang tidak memotong 'ayam' sama sekali.
    const nowB = consumptionForLine({ product: paketPilih, quantity: 1, factor: 1, choices: [] });
    expect(nowB).toEqual([]);
    // Batal mengembalikan ke 'ayam', bukan ke item stok Setup B.
    expect(restoreDelta(totalConsumed(lines))).toEqual({ ayam: 3 });
  });
});

describe("findShortages dan fitsInStock", () => {
  it("pesan dalam satuan item stok", () => {
    const shortages = findShortages({ ayam: 2, kaki: 1200 }, [
      { stockItemId: "ayam", qty: 3 },
      { stockItemId: "kaki", qty: 1500 },
    ], stock, PRESET_UNITS);
    expect(shortages.map((s) => s.message)).toEqual([
      "Stok Ayam utuh kurang: sisa 2 ekor, butuh 3 ekor.",
      "Stok Kaki ayam kurang: sisa 1,2 kg, butuh 1,5 kg.",
    ]);
  });

  it("stok negatif ditampilkan sebagai sisa 0", () => {
    const [s] = findShortages({ ayam: -2 }, [{ stockItemId: "ayam", qty: 1 }], stock, PRESET_UNITS);
    expect(s.message).toContain("sisa 0 ekor");
  });

  it("item stok yang sudah dihapus tidak menghalangi", () => {
    expect(findShortages({}, [{ stockItemId: "hilang", qty: 1 }], stock, PRESET_UNITS)).toEqual([]);
  });

  it("tap hanya memeriksa item yang disentuh tambahan", () => {
    const cart = [{ stockItemId: "ayam", qty: 5 }]; // sudah kurang
    expect(fitsInStock({ ayam: 3, hati: 10 }, cart, [{ stockItemId: "hati", qty: 1 }])).toBe(true);
    expect(fitsInStock({ ayam: 3, hati: 10 }, cart, [{ stockItemId: "ayam", qty: 1 }])).toBe(false);
    expect(fitsInStock({ ayam: 6 }, cart, [{ stockItemId: "ayam", qty: 1 }])).toBe(true);
  });

  it("stockLevelState", () => {
    expect(stockLevelState(0, stock[2])).toBe("empty");
    expect(stockLevelState(-1, stock[2])).toBe("empty");
    expect(stockLevelState(1000, stock[2])).toBe("low");
    expect(stockLevelState(1001, stock[2])).toBe("ok");
    expect(stockLevelState(1, stock[0])).toBe("ok");
  });
});

describe("pilihan", () => {
  const group = paketPilih.choiceGroups![0];

  it("tepat 3, boleh berulang", () => {
    let picks: LineChoice[] = [];
    picks = togglePick(group, picks, "u40", 1);
    picks = togglePick(group, picks, "u40", 1);
    expect(validateChoices(paketPilih, picks)).toBe("Pilih 3 ayam: pilih 1 lagi.");
    picks = togglePick(group, picks, "u55", 1);
    expect(validateChoices(paketPilih, picks)).toBeNull();
    // max tercapai: tambahan diabaikan
    expect(togglePick(group, picks, "u35", 1)).toEqual(picks);
    picks = togglePick(group, picks, "u40", -1);
    expect(picks.find((p) => p.optionId === "u40")?.count).toBe(1);
  });

  it("tanpa repeat: opsi yang sama ditolak", () => {
    const noRepeat = { ...group, allowRepeat: false };
    const p = togglePick(noRepeat, [], "u40", 1);
    expect(togglePick(noRepeat, p, "u40", 1)).toEqual(p);
    expect(validateChoices({ ...paketPilih, choiceGroups: [noRepeat] }, [{ ...p[0], count: 2 }])).toBe(
      "Pilih 3 ayam: setiap opsi hanya boleh sekali.",
    );
  });

  it("grup max 1 berperilaku seperti radio", () => {
    const level = {
      id: "lv",
      label: "Level",
      min: 1,
      max: 1,
      allowRepeat: false,
      options: [
        { id: "1", label: "Sedang" },
        { id: "2", label: "Pedas", priceDelta: 2000 },
      ],
    };
    let picks = togglePick(level, [], "1", 1);
    picks = togglePick(level, picks, "2", 1);
    expect(picks).toEqual([{ groupId: "lv", optionId: "2", label: "Pedas", count: 1, priceDelta: 2000 }]);
  });

  it("kunci pilihan tidak bergantung urutan", () => {
    const a = [
      { groupId: "g", optionId: "x", label: "", count: 1 },
      { groupId: "g", optionId: "y", label: "", count: 2 },
    ];
    expect(choicesKey(a)).toBe(choicesKey([...a].reverse()));
    expect(choicesKey(a)).not.toBe(choicesKey([{ ...a[0], count: 2 }, a[1]]));
  });
});

describe("consumesForMode", () => {
  it("own memotong item stok miliknya satu satuan jual per unit", () => {
    expect(consumesForMode("own", "p1", 1, undefined)).toEqual([{ stockItemId: ownStockItemId("p1"), qty: 1 }]);
    expect(consumesForMode("own", "p1", 1000, undefined)).toEqual([{ stockItemId: "own-p1", qty: 1000 }]);
  });
  it("shared memakai daftar yang dipilih, none kosong", () => {
    expect(consumesForMode("shared", "p1", 1, [{ stockItemId: "ayam", qty: 3 }, { stockItemId: "x", qty: 0 }])).toEqual([
      { stockItemId: "ayam", qty: 3 },
    ]);
    expect(consumesForMode("none", "p1", 1, [{ stockItemId: "ayam", qty: 3 }])).toEqual([]);
  });
});
