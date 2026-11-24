import type {
  ChoiceGroup,
  Consume,
  LineChoice,
  Product,
  StockItem,
  StockMode,
  Unit,
} from "../../domain/types";
import { divRound } from "../../lib/intMath";
import { findUnit, formatQuantity } from "../units/units";

/**
 * Mesin konsumsi stok. **Satu-satunya tempat yang tahu berapa stok dipotong
 * oleh sebuah penjualan.** Checkout, batal, dan Ubah Item memanggil fungsi di
 * sini; tidak ada aritmetika stok di komponen.
 *
 * Model:
 * - `product.consumes` = item stok per 1 satuan jual. Diabaikan bila
 *   `stockMode === 'none'`.
 * - Setiap opsi pilihan (`choiceGroups[].options[].consumes`) memotong stok
 *   per kali dipilih, per 1 unit produk, apa pun `stockMode`-nya. Paket
 *   "pilih 3 ayam" biasanya `stockMode: 'none'` dengan stok di opsinya.
 * - Bonus (`freeItems`) memotong `consumes` produk bonusnya × qty per 1 unit.
 * - Jumlah dihitung dalam satuan dasar: `qty × quantity ÷ factor`, dibulatkan.
 *
 * Hasilnya disimpan di baris pesanan sebagai snapshot `consumed`. Batal dan
 * Ubah Item membaca snapshot itu, **bukan** data produk saat ini, sehingga
 * pemilik bebas mengganti mode stok atau isi paket kapan saja.
 */

/** Jumlahkan per stockItemId, buang yang nol, urut stabil sesuai kemunculan. */
export const mergeConsumes = (...lists: readonly (readonly Consume[] | undefined)[]): Consume[] => {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const c of list ?? []) {
      if (!c.stockItemId || !Number.isFinite(c.qty)) continue;
      totals.set(c.stockItemId, (totals.get(c.stockItemId) ?? 0) + c.qty);
    }
  }
  return [...totals].filter(([, qty]) => qty !== 0).map(([stockItemId, qty]) => ({ stockItemId, qty }));
};

/** consumes × (jumlah ÷ faktor), dibulatkan per item stok. */
export const scaleConsumes = (
  consumes: readonly Consume[] | undefined,
  multiplier: number,
  divisor = 1,
): Consume[] =>
  mergeConsumes(
    (consumes ?? []).map((c) => ({ stockItemId: c.stockItemId, qty: divRound(c.qty * multiplier, divisor) })),
  );

/** consumes dasar produk sesuai mode stoknya. */
export const baseConsumes = (product: Pick<Product, "stockMode" | "consumes">): Consume[] =>
  product.stockMode === "none" ? [] : [...(product.consumes ?? [])];

export interface LineInput {
  product: Product;
  /** Satuan dasar. */
  quantity: number;
  /** Faktor satuan jual produk. */
  factor: number;
  choices?: readonly LineChoice[];
  /** Untuk bonus: produk lain berdasarkan id. */
  productsById?: ReadonlyMap<string, Product>;
}

/** Konsumsi per 1 unit produk dari pilihan yang dipilih. */
const choicesConsumesPerUnit = (product: Product, choices: readonly LineChoice[] | undefined): Consume[] => {
  const parts: Consume[][] = [];
  for (const choice of choices ?? []) {
    const group = product.choiceGroups?.find((g) => g.id === choice.groupId);
    const option = group?.options.find((o) => o.id === choice.optionId);
    if (!option) continue;
    parts.push(scaleConsumes(option.consumes, choice.count));
  }
  return mergeConsumes(...parts);
};

/** Konsumsi per 1 unit produk dari bonusnya. Bonus dari bonus tidak dihitung. */
const freeConsumesPerUnit = (product: Product, productsById?: ReadonlyMap<string, Product>): Consume[] => {
  const parts: Consume[][] = [];
  for (const free of product.freeItems ?? []) {
    const freeProduct = productsById?.get(free.productId);
    if (!freeProduct || freeProduct.id === product.id) continue;
    parts.push(scaleConsumes(baseConsumes(freeProduct), free.qty));
  }
  return mergeConsumes(...parts);
};

/** Snapshot konsumsi untuk satu baris pesanan. */
export const consumptionForLine = ({ product, quantity, factor, choices, productsById }: LineInput): Consume[] => {
  const perUnit = mergeConsumes(
    baseConsumes(product),
    choicesConsumesPerUnit(product, choices),
    freeConsumesPerUnit(product, productsById),
  );
  return scaleConsumes(perUnit, quantity, factor);
};

/** Total konsumsi dari beberapa baris (snapshot). */
export const totalConsumed = (lines: readonly { consumed: readonly Consume[] }[]): Consume[] =>
  mergeConsumes(...lines.map((l) => l.consumed));

/**
 * Perubahan level stok: negatif = dipotong. Untuk checkout, `deductionDelta`;
 * untuk batal, `restoreDelta`; untuk Ubah Item, `editDelta(lama, baru)`, yang
 * mengembalikan yang lama lalu memotong yang baru dalam satu angka.
 */
export const deductionDelta = (consumed: readonly Consume[]): Record<string, number> =>
  Object.fromEntries(mergeConsumes(consumed).map((c) => [c.stockItemId, -c.qty]));

export const restoreDelta = (consumed: readonly Consume[]): Record<string, number> =>
  Object.fromEntries(mergeConsumes(consumed).map((c) => [c.stockItemId, c.qty]));

export const editDelta = (before: readonly Consume[], after: readonly Consume[]): Record<string, number> =>
  Object.fromEntries(
    mergeConsumes(
      before,
      after.map((c) => ({ stockItemId: c.stockItemId, qty: -c.qty })),
    ).map((c) => [c.stockItemId, c.qty]),
  );

export interface Shortage {
  stockItemId: string;
  needed: number;
  available: number;
  message: string;
}

/**
 * Kekurangan stok untuk sebuah konsumsi, siap ditampilkan. Kosong = aman.
 * Item stok yang tidak dikenal (sudah dihapus) dilewati, bukan menghalangi.
 */
export const findShortages = (
  levels: Readonly<Record<string, number>>,
  consumed: readonly Consume[],
  stockItems: readonly StockItem[],
  units: readonly Unit[],
): Shortage[] => {
  const shortages: Shortage[] = [];
  for (const c of mergeConsumes(consumed)) {
    if (c.qty <= 0) continue;
    const item = stockItems.find((s) => s.id === c.stockItemId);
    if (!item) continue;
    const available = levels[c.stockItemId] ?? 0;
    if (available >= c.qty) continue;
    const unit = findUnit(units, item.unit);
    shortages.push({
      stockItemId: c.stockItemId,
      needed: c.qty,
      available,
      message: `Stok ${item.name} kurang: sisa ${formatQuantity(Math.max(0, available), unit)}, butuh ${formatQuantity(c.qty, unit)}.`,
    });
  }
  return shortages;
};

/** Apakah keranjang + tambahan masih muat di stok. Dipakai saat tap di kasir. */
export const fitsInStock = (
  levels: Readonly<Record<string, number>>,
  current: readonly Consume[],
  extra: readonly Consume[],
): boolean => {
  const extraIds = new Set(extra.filter((c) => c.qty > 0).map((c) => c.stockItemId));
  // Hanya item yang disentuh tambahan ini: keranjang yang sudah kurang di
  // item lain tetap boleh menambah barang yang stoknya ada.
  return mergeConsumes(current, extra)
    .filter((c) => extraIds.has(c.stockItemId))
    .every((c) => (levels[c.stockItemId] ?? 0) >= c.qty);
};

export type StockLevelState = "ok" | "low" | "empty";

export const stockLevelState = (level: number, item: Pick<StockItem, "lowAt">): StockLevelState => {
  if (level <= 0) return "empty";
  if (typeof item.lowAt === "number" && level <= item.lowAt) return "low";
  return "ok";
};

/* ------------------------------------------------------------------ */
/* Pilihan (choiceGroups)                                              */
/* ------------------------------------------------------------------ */

/** Jumlah pilihan di satu grup. */
export const groupPickCount = (choices: readonly LineChoice[], groupId: string): number =>
  choices.filter((c) => c.groupId === groupId).reduce((sum, c) => sum + c.count, 0);

/** Pesan untuk satu grup bila belum memenuhi min/max/repeat, atau null bila valid. */
export const validateGroupPicks = (group: ChoiceGroup, choices: readonly LineChoice[]): string | null => {
  const picks = choices.filter((c) => c.groupId === group.id);
  const count = picks.reduce((sum, c) => sum + c.count, 0);
  if (picks.some((c) => !group.options.some((o) => o.id === c.optionId))) return `${group.label}: opsi tidak dikenal.`;
  if (picks.some((c) => !Number.isInteger(c.count) || c.count < 1)) return `${group.label}: jumlah tidak valid.`;
  if (!group.allowRepeat && picks.some((c) => c.count > 1)) return `${group.label}: setiap opsi hanya boleh sekali.`;
  if (count < group.min) return `${group.label}: pilih ${group.min - count} lagi.`;
  if (count > group.max) return `${group.label}: maksimal ${group.max}.`;
  return null;
};

/** Pesan pertama untuk semua grup, atau null bila pilihan lengkap. */
export const validateChoices = (product: Product, choices: readonly LineChoice[]): string | null => {
  for (const group of product.choiceGroups ?? []) {
    const message = validateGroupPicks(group, choices);
    if (message) return message;
  }
  const known = new Set((product.choiceGroups ?? []).map((g) => g.id));
  if (choices.some((c) => !known.has(c.groupId))) return "Pilihan untuk grup yang tidak ada.";
  return null;
};

/**
 * Tambah atau kurangi satu pilihan, menghormati max dan allowRepeat. Untuk grup
 * max 1 tanpa repeat, memilih opsi lain menggantikan pilihan sebelumnya (seperti
 * radio button).
 */
export const togglePick = (
  group: ChoiceGroup,
  choices: readonly LineChoice[],
  optionId: string,
  direction: 1 | -1,
): LineChoice[] => {
  const option = group.options.find((o) => o.id === optionId);
  if (!option) return [...choices];
  const others = choices.filter((c) => c.groupId !== group.id);
  let picks = choices.filter((c) => c.groupId === group.id).map((c) => ({ ...c }));
  const existing = picks.find((c) => c.optionId === optionId);
  const count = picks.reduce((sum, c) => sum + c.count, 0);

  if (direction === -1) {
    if (!existing) return [...choices];
    existing.count -= 1;
    picks = picks.filter((c) => c.count > 0);
    return [...others, ...picks];
  }

  if (group.max === 1 && !group.allowRepeat) {
    return [...others, { groupId: group.id, optionId, label: option.label, count: 1, ...priceDeltaOf(option.priceDelta) }];
  }
  if (count >= group.max) return [...choices];
  if (existing) {
    if (!group.allowRepeat) return [...choices];
    existing.count += 1;
  } else {
    picks.push({ groupId: group.id, optionId, label: option.label, count: 1, ...priceDeltaOf(option.priceDelta) });
  }
  return [...others, ...picks];
};

const priceDeltaOf = (delta: number | undefined) => (delta ? { priceDelta: delta } : {});

/** Kunci stabil untuk membandingkan dua set pilihan (menggabungkan baris keranjang). */
export const choicesKey = (choices: readonly LineChoice[] | undefined): string =>
  (choices ?? [])
    .map((c) => `${c.groupId}:${c.optionId}x${c.count}`)
    .sort()
    .join("|");

/* ------------------------------------------------------------------ */
/* Editor produk: mode stok                                            */
/* ------------------------------------------------------------------ */

/** Id item stok yang dibuat otomatis untuk produk bermode "stok sendiri". */
export const ownStockItemId = (productId: string): string => `own-${productId}`;

/**
 * consumes yang benar untuk sebuah mode stok. Mode "own" memotong item stok
 * miliknya sendiri sebanyak 1 satuan jual per unit (faktor satuan dasar).
 */
export const consumesForMode = (
  mode: StockMode,
  productId: string,
  factor: number,
  shared: readonly Consume[] | undefined,
): Consume[] => {
  if (mode === "none") return [];
  if (mode === "own") return [{ stockItemId: ownStockItemId(productId), qty: factor }];
  return mergeConsumes(shared).filter((c) => c.qty > 0);
};
