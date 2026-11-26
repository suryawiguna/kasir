import type { Branch, Category, Product, ShopConfig, StockItem } from "../../domain/types";
import { consumesForMode, ownStockItemId } from "../stock/consumption";

/**
 * Isi satu demo dari template per jenis usaha
 * (`clients/kasir-demo/templates/<template>.json`, format sama dengan
 * seed.json), ditimpa nama toko, warna, cabang, dan produk calon klien.
 * Murni; `scripts/seed-demo.mjs` menulis hasilnya ke `demos/{demoId}/`.
 */
export interface DemoSeed {
  /** Jumlah pesanan contoh per hari per cabang [min, max]. Salon lebih sedikit dari warung. */
  sampleOrdersPerDay?: [number, number];
  config: Omit<ShopConfig, "updatedAt" | "updatedBy">;
  features: Record<string, boolean>;
  branches: Branch[];
  categories: Category[];
  stockItems: StockItem[];
  products: Product[];
  /** branchId -> stockItemId -> jumlah satuan dasar. */
  inventory: Record<string, Record<string, number>>;
}

export interface DemoOverrides {
  name?: string;
  color?: string;
  /** Nama cabang, berurutan, boleh dengan kode ("Lapak Tikala:TKL"). Id jadi c1, c2, ... */
  branchNames?: string[];
  /** Isi file `--products`: daftar produk, atau objek berisi categories/stockItems/products/inventory. */
  products?: unknown;
}

/** Stok awal untuk item stok yang dibuat otomatis (produk "stok sendiri" dari --products). */
export const DEFAULT_OWN_STOCK = 50;

const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * "Tikala" → kode "TIK". Kode bisa ditulis sendiri dengan titik dua:
 * "Lapak Tikala:TKL" (tanpa itu kedua lapak jadi LAP dan LA2). Kode unik,
 * pola kode cabang `^[A-Z0-9]{2,6}$`; kode tulisan sendiri yang salah ditolak.
 */
export const branchesFromNames = (names: readonly string[]): Branch[] => {
  const used = new Set<string>();
  return names
    .map((n) => n.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const colon = entry.lastIndexOf(":");
      const name = (colon >= 0 ? entry.slice(0, colon) : entry).trim();
      const given = colon >= 0 ? entry.slice(colon + 1).trim().toUpperCase() : "";
      if (!name) throw new Error(`Cabang "${entry}": nama kosong.`);
      if (colon >= 0) {
        if (!/^[A-Z0-9]{2,6}$/.test(given)) throw new Error(`Kode cabang "${given}" harus 2-6 huruf besar/angka.`);
        if (used.has(given)) throw new Error(`Kode cabang ${given} dipakai dua kali.`);
        used.add(given);
        return { id: `c${i + 1}`, name, code: given, active: true, order: i };
      }
      const letters = name
        .normalize("NFD")
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase();
      let code = letters.length >= 2 ? letters.slice(0, 3) : `C${i + 1}`;
      for (let n = 2; used.has(code); n++) code = `${(letters || "C").slice(0, 2).padEnd(2, "C")}${n}`;
      used.add(code);
      return { id: `c${i + 1}`, name, code, active: true, order: i };
    });
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Produk dari luar (file --products) dibuat aman untuk aplikasi: field wajib
 * diisi bawaan, satuan yang tidak dikenal jadi satuan pertama, konsumsi ke
 * item stok yang tidak ada dibuang, dan produk "stok sendiri" mendapat item
 * stoknya.
 */
const normalizeProducts = (seed: DemoSeed): DemoSeed => {
  const unitCodes = new Set(seed.config.units.map((u) => u.code));
  const fallbackUnit = seed.config.units[0]?.code ?? "pcs";
  const categoryIds = new Set(seed.categories.map((c) => c.id));
  const stockItems = [...seed.stockItems];
  const inventory = Object.fromEntries(Object.entries(seed.inventory).map(([b, l]) => [b, { ...l }]));
  const products = seed.products.map((raw, i) => {
    const p = { ...raw } as Product;
    if (typeof p.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id)) throw new Error(`Produk #${i + 1}: id wajib (huruf, angka, - atau _).`);
    if (typeof p.name !== "string" || !p.name.trim()) throw new Error(`Produk ${p.id}: nama wajib.`);
    if (typeof p.price !== "number" || !Number.isInteger(p.price) || p.price < 0) throw new Error(`Produk ${p.id}: harga harus bilangan bulat rupiah.`);
    if (!unitCodes.has(p.unit)) p.unit = fallbackUnit;
    if (p.soldBy !== "weight") p.soldBy = "count";
    if (p.categoryId && !categoryIds.has(p.categoryId)) delete p.categoryId;
    if (typeof p.order !== "number") p.order = i;
    if (typeof p.active !== "boolean") p.active = true;
    if (p.stockMode === "own") {
      const id = ownStockItemId(p.id);
      const factor = seed.config.units.find((u) => u.code === p.unit)?.factor ?? 1;
      if (!stockItems.some((s) => s.id === id)) {
        stockItems.push({ id, name: p.name, unit: p.unit, active: true, order: stockItems.length, ownerProductId: p.id });
        for (const levels of Object.values(inventory)) levels[id] ??= DEFAULT_OWN_STOCK * factor;
      }
      p.consumes = consumesForMode("own", p.id, factor, undefined);
    } else if (p.stockMode !== "shared") {
      p.stockMode = "none";
      delete p.consumes;
    }
    const known = new Set(stockItems.map((s) => s.id));
    if (p.consumes) p.consumes = p.consumes.filter((c) => known.has(c.stockItemId) && c.qty > 0);
    if (p.stockMode === "shared" && !p.consumes?.length) {
      p.stockMode = "none";
      delete p.consumes;
    }
    return p;
  });
  return { ...seed, products, stockItems, inventory };
};

/** Pasang cabang baru, memetakan cabang template ke-i ke cabang baru ke-i (sisanya ke cabang template pertama). */
const replaceBranches = (seed: DemoSeed, names: readonly string[]): DemoSeed => {
  const branches = branchesFromNames(names);
  if (branches.length === 0) throw new Error("--branches kosong.");
  const sourceOf = new Map(branches.map((b, i) => [b.id, (seed.branches[i] ?? seed.branches[0])?.id]));
  const inventory: DemoSeed["inventory"] = {};
  for (const b of branches) inventory[b.id] = { ...(seed.inventory[sourceOf.get(b.id) ?? ""] ?? {}) };
  const products = seed.products.map((raw) => {
    const p = { ...raw };
    if (p.branchIds?.length) {
      const ids = branches.filter((b) => p.branchIds!.includes(sourceOf.get(b.id) ?? "")).map((b) => b.id);
      if (ids.length) p.branchIds = ids;
      else delete p.branchIds;
    }
    if (p.priceByBranch) {
      const prices: Record<string, number> = {};
      for (const b of branches) {
        const price = p.priceByBranch[sourceOf.get(b.id) ?? ""];
        if (typeof price === "number") prices[b.id] = price;
      }
      if (Object.keys(prices).length) p.priceByBranch = prices;
      else delete p.priceByBranch;
    }
    return p;
  });
  return { ...seed, branches, inventory, products };
};

const replaceProducts = (seed: DemoSeed, input: unknown): DemoSeed => {
  const next: DemoSeed = { ...seed };
  if (Array.isArray(input)) {
    next.products = input as Product[];
  } else if (isRecord(input) && Array.isArray(input.products)) {
    next.products = input.products as Product[];
    if (Array.isArray(input.categories)) next.categories = input.categories as Category[];
    if (Array.isArray(input.stockItems)) next.stockItems = input.stockItems as StockItem[];
    if (isRecord(input.inventory)) {
      // Satu peta stok untuk semua cabang, atau per id cabang.
      const inv = input.inventory as Record<string, unknown>;
      const perBranch = seed.branches.some((b) => isRecord(inv[b.id]));
      next.inventory = Object.fromEntries(
        seed.branches.map((b) => [b.id, { ...((perBranch ? inv[b.id] : inv) as Record<string, number>) }]),
      );
    }
  } else {
    throw new Error("File --products harus berisi daftar produk, atau objek dengan `products`.");
  }
  return normalizeProducts(next);
};

export const applyOverrides = (template: DemoSeed, o: DemoOverrides): DemoSeed => {
  let seed: DemoSeed = {
    ...template,
    config: { ...template.config, receipt: { ...template.config.receipt } },
  };
  if (o.products !== undefined) seed = replaceProducts(seed, o.products);
  if (o.branchNames) seed = replaceBranches(seed, o.branchNames);
  if (o.name?.trim()) {
    const name = o.name.trim().slice(0, 80);
    seed.config.name = name;
    seed.config.receipt.header = [name, ...(template.config.receipt?.header ?? []).slice(1)];
  }
  if (o.color !== undefined) {
    if (!COLOR.test(o.color)) throw new Error(`Warna harus #RRGGBB, bukan "${o.color}".`);
    seed.config.brandColor = o.color.toLowerCase();
  }
  return seed;
};

/** Masalah isi demo yang membuat aplikasi rusak, untuk dicek sebelum menulis. */
export const seedProblems = (seed: DemoSeed): string[] => {
  const problems: string[] = [];
  const branchIds = new Set(seed.branches.map((b) => b.id));
  const stockIds = new Set(seed.stockItems.map((s) => s.id));
  const units = new Set(seed.config.units.map((u) => u.code));
  if (!seed.branches.some((b) => b.active)) problems.push("Tidak ada cabang aktif.");
  for (const b of seed.branches) if (!/^[A-Z0-9]{2,6}$/.test(b.code)) problems.push(`Kode cabang ${b.id} tidak valid: ${b.code}`);
  for (const s of seed.stockItems) if (!units.has(s.unit)) problems.push(`Item stok ${s.id}: satuan ${s.unit} tidak ada.`);
  for (const p of seed.products) {
    if (!units.has(p.unit)) problems.push(`Produk ${p.id}: satuan ${p.unit} tidak ada.`);
    for (const c of p.consumes ?? []) if (!stockIds.has(c.stockItemId)) problems.push(`Produk ${p.id}: item stok ${c.stockItemId} tidak ada.`);
    for (const g of p.choiceGroups ?? [])
      for (const opt of g.options)
        for (const c of opt.consumes ?? []) if (!stockIds.has(c.stockItemId)) problems.push(`Produk ${p.id}/${opt.id}: item stok ${c.stockItemId} tidak ada.`);
    for (const id of p.branchIds ?? []) if (!branchIds.has(id)) problems.push(`Produk ${p.id}: cabang ${id} tidak ada.`);
    for (const f of p.freeItems ?? []) if (!seed.products.some((q) => q.id === f.productId)) problems.push(`Produk ${p.id}: bonus ${f.productId} tidak ada.`);
  }
  for (const id of Object.keys(seed.inventory)) if (!branchIds.has(id)) problems.push(`Stok untuk cabang ${id} yang tidak ada.`);
  // Stok sekarang wajib ada dan positif untuk setiap item aktif yang dijual.
  const sold = new Set(seed.products.flatMap((p) => [...(p.consumes ?? []), ...(p.choiceGroups ?? []).flatMap((g) => g.options.flatMap((o) => o.consumes ?? []))].map((c) => c.stockItemId)));
  for (const b of seed.branches.filter((x) => x.active))
    for (const s of seed.stockItems.filter((x) => x.active && sold.has(x.id)))
      if (!((seed.inventory[b.id]?.[s.id] ?? 0) > (s.lowAt ?? 0))) problems.push(`Stok ${s.id} di cabang ${b.id} kosong atau sudah menipis.`);
  return problems;
};
