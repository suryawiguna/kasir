import type { LineChoice, Order, PaymentMethod, Product, Timezone } from "../../domain/types";
import { getBusinessDate, getBusinessDateCompact, getBusinessTime, UTC_OFFSETS } from "../../lib/businessDate";
import { buildOrder } from "../orders/buildOrder";
import { buildOrderNumber } from "../orders/orderNumber";
import { addToCart, cartProblem, cashSuggestions, priceCart, sellableProducts, tillProduct, toOrderLines, type CartLine } from "../pos/cart";
import { parseFeatures } from "../settings/featureFlags";
import { validateChoices } from "../stock/consumption";
import { findUnit, stepBase } from "../units/units";
import type { DemoSeed } from "./demoTemplate";

/**
 * Pesanan contoh untuk demo: beberapa hari terakhir, setiap cabang, jam buka
 * wajar, campuran tunai/transfer, sebagian kecil batal. Supaya Laporan terlihat
 * hidup: akhir pekan lebih ramai, jam ramai dari template (`sampleHours`),
 * cabang pertama lebih ramai dari berikutnya (2 cabang ≈ 60/40), dan 1-2 item
 * stok menipis. Dibuat lewat fungsi
 * yang sama dengan kasir (cart → toOrderLines → buildOrder → nomor pesanan),
 * jadi bentuk dokumen dan snapshot `consumed` sama persis dengan pesanan asli.
 *
 * Stok: angka di template adalah **sisa stok sekarang**, sesudah pesanan
 * contoh (stok pagi = sisa + terjual hari ini, hari-hari sebelumnya diganti
 * stok masuk). Jadi stok demo tidak pernah minus atau habis: dengan kebijakan
 * "block", stok yang habis membuat prospek tidak bisa mencoba menjual. Item
 * yang dibuat menipis tetap di atas 0 (tepat di `lowAt`).
 */
export interface SampleOrdersInput {
  seed: DemoSeed;
  /** Jumlah hari ke belakang, termasuk hari ini. */
  days: number;
  now: Date;
  /** 0..1, mis. `mulberry32(seed)` supaya hasil bisa diulang. */
  random: () => number;
  createdBy: string;
  newId: () => string;
  /** Pesanan per hari per cabang, inklusif. */
  perDay?: [number, number];
}

export interface SampleOrdersResult {
  orders: Order[];
  inventory: Record<string, Record<string, number>>;
}

/** PRNG kecil yang bisa diulang (mulberry32). */
export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Angka seed dari teks (id demo), supaya demo yang sama di-seed sama. */
export const hashSeed = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

const CUSTOMERS = ["Bu Rina", "Pak Joni", "Kak Maya", "Om Frans", "Tante Lina", "Ci Mei", "Bu Sari", "Pak Hendra", "Kak Dewi", "Mas Andi"];

const DEFAULT_HOURS = { open: 9, close: 20, peaks: [] as number[] };
/** Pesanan akhir pekan dibanding hari biasa. */
export const WEEKEND_FACTOR = 1.4;
/** Pesanan cabang ke-i dibanding cabang pertama: 1, 0,67, 0,5, ... (2 cabang ≈ 60/40). */
export const branchFactor = (index: number): number => 1 / (1 + 0.5 * index);
const PEAK_WEIGHT = 3;

const pick = <T,>(random: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
const between = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

/** Instant UTC untuk tanggal bisnis + menit sejak tengah malam di zona toko. */
const atLocal = (timezone: Timezone, date: string, minute: number, second: number): Date => {
  const hh = String(Math.floor(minute / 60)).padStart(2, "0");
  const mm = String(minute % 60).padStart(2, "0");
  const ss = String(second).padStart(2, "0");
  return new Date(`${date}T${hh}:${mm}:${ss}.000${UTC_OFFSETS[timezone]}`);
};

/** Waktu ambil 2 jam setelah pesan (paling lambat 21:00), format input datetime-local. */
const pickupAfter = (timezone: Timezone, date: string, time: Date): string => {
  const hour = Math.min(21, Number(getBusinessTime(timezone, time).slice(0, 2)) + 2);
  return `${date}T${String(hour).padStart(2, "0")}:00`;
};

/** Pilihan acak yang valid untuk semua grup produk ini, atau null bila tidak bisa. */
const randomChoices = (product: Product, random: () => number): LineChoice[] | null => {
  const choices: LineChoice[] = [];
  for (const group of product.choiceGroups ?? []) {
    const options = group.options.filter((o) => o.active !== false);
    if (options.length === 0) {
      if (group.min > 0) return null;
      continue;
    }
    const maxPicks = group.allowRepeat ? group.max : Math.min(group.max, options.length);
    const target = between(random, Math.min(group.min, maxPicks), maxPicks);
    const counts = new Map<string, number>();
    const pool = [...options];
    for (let i = 0; i < target; i++) {
      const option = group.allowRepeat ? pick(random, pool) : pool.splice(Math.floor(random() * pool.length), 1)[0];
      counts.set(option.id, (counts.get(option.id) ?? 0) + 1);
    }
    for (const [optionId, count] of counts) {
      const option = options.find((o) => o.id === optionId)!;
      choices.push({ groupId: group.id, optionId, label: option.label, count, ...(option.priceDelta ? { priceDelta: option.priceDelta } : {}) });
    }
  }
  return validateChoices(product, choices) ? null : choices;
};

export const generateSampleOrders = (input: SampleOrdersInput): SampleOrdersResult => {
  const { seed, random, now } = input;
  const [minPerDay, maxPerDay] = input.perDay ?? seed.sampleOrdersPerDay ?? [8, 20];
  const timezone = seed.config.timezone;
  const features = parseFeatures(seed.features);
  const units = seed.config.units;
  const products = seed.products.map((p) =>
    tillProduct(p, { stockTracking: features.stockTracking, branchPricing: features.branchPricing, freeItems: features.freeItems }),
  );
  const productsById = new Map(products.map((p) => [p.id, p]));
  const hiddenCategoryIds = new Set(seed.categories.filter((c) => !c.active).map((c) => c.id));
  const methods: [PaymentMethod, number][] = [
    ["cash", 6],
    ...(features.transfer ? ([["transfer", 3]] as [PaymentMethod, number][]) : []),
    ...(features.qris ? ([["qris", 2]] as [PaymentMethod, number][]) : []),
  ];
  const pickMethod = (): PaymentMethod => {
    let r = random() * methods.reduce((s, [, w]) => s + w, 0);
    for (const [m, w] of methods) if ((r -= w) < 0) return m;
    return "cash";
  };

  const today = getBusinessDate(timezone, now);
  const orders: Order[] = [];
  const hours = { ...DEFAULT_HOURS, ...seed.sampleHours };
  const hourWeights: [number, number][] = [];
  for (let h = hours.open; h < hours.close; h++) hourWeights.push([h, hours.peaks?.includes(h) ? PEAK_WEIGHT : 1]);
  const totalWeight = hourWeights.reduce((s, [, w]) => s + w, 0);
  const pickMinute = (): number => {
    let r = random() * totalWeight;
    for (const [h, w] of hourWeights) if ((r -= w) < 0) return h * 60 + between(random, 0, 59);
    return (hours.close - 1) * 60 + between(random, 0, 59);
  };

  seed.branches.filter((b) => b.active).forEach((branch, branchIndex) => {
    const sellable = sellableProducts(products, {
      branchId: branch.id,
      hiddenCategoryIds,
      weightSales: features.weightSales,
      bundles: features.bundles,
    });
    if (sellable.length === 0) return;
    const catalog = { productsById, units, branchId: branch.id };
    const letter = "A";
    let sequence = 0;

    for (let back = input.days - 1; back >= 0; back--) {
      const date = getBusinessDate(timezone, new Date(now.getTime() - back * 86400000));
      const isToday = date === today;
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      const factor = branchFactor(branchIndex) * (weekday === 0 || weekday === 6 ? WEEKEND_FACTOR : 1);
      const count = Math.max(1, Math.round(between(random, minPerDay, maxPerDay) * factor));
      const minutes = Array.from({ length: count }, pickMinute).sort((a, b) => a - b);
      const times = minutes.map((m) => atLocal(timezone, date, m, between(random, 0, 59))).filter((t) => t.getTime() < now.getTime());

      times.forEach((time, index) => {
        let cart: CartLine[] = [];
        const lineCount = between(random, 1, Math.min(3, sellable.length));
        for (let i = 0; i < lineCount; i++) {
          const product = pick(random, sellable);
          const step = stepBase(findUnit(units, product.unit));
          const quantity = product.soldBy === "weight" ? step * between(random, 3, 15) : step * pick(random, [1, 1, 1, 1, 2, 2, 3]);
          const choices = product.choiceGroups?.length ? randomChoices(product, random) : undefined;
          if (choices === null) continue;
          cart = addToCart(cart, product, quantity, choices);
        }
        const priced = priceCart(cart, catalog);
        if (cartProblem(priced, branch.id)) return;

        // Pesanan diambil nanti: hanya hari ini yang masih menunggu.
        const lastOfToday = isToday && index >= times.length - 2;
        const preorder = features.preorder && (lastOfToday ? random() < 0.6 : random() < 0.08);
        const total = priced.reduce((s, l) => s + l.total, 0);
        const method = pickMethod();
        const payment =
          preorder && isToday && random() < 0.6
            ? null
            : { method, ...(method === "cash" ? { cashReceived: pick(random, cashSuggestions(total)) } : {}) };
        const customerName = preorder || (features.customers && random() < 0.3) ? pick(random, CUSTOMERS) : undefined;

        sequence += 1;
        const createdAt = time.toISOString();
        const result = buildOrder({
          id: input.newId(),
          orderNumber: buildOrderNumber(getBusinessDateCompact(timezone, time), branch.code, letter, sequence),
          branchId: branch.id,
          deviceLetter: letter,
          items: toOrderLines(priced, productsById, input.newId),
          orderType: preorder ? "preorder" : "instant",
          instantStatus: seed.config.instantStatus,
          payment,
          customerName,
          pickupTime: preorder && isToday ? pickupAfter(timezone, date, time) : undefined,
          createdBy: input.createdBy,
          now: createdAt,
        });
        if (!result.ok) {
          sequence -= 1;
          return;
        }
        const order = result.order;

        // Yang sudah lewat selesai; yang hari ini sebagian masih diproses.
        if (!isToday || (!preorder && index < times.length - 3)) {
          if (order.orderStatus !== "completed") {
            order.orderStatus = "completed";
            order.updatedAt = new Date(time.getTime() + 15 * 60000).toISOString();
            order.updatedBy = input.createdBy;
          }
          if (order.paymentStatus === "unpaid") {
            order.paymentStatus = "paid";
            order.paymentMethod = "transfer";
            order.paidAt = order.updatedAt ?? createdAt;
          }
        }
        // Sebagian kecil batal (stok kembali, jadi tidak dihitung).
        if (!lastOfToday && random() < 0.04) {
          const at = new Date(time.getTime() + 5 * 60000).toISOString();
          order.orderStatus = "cancelled";
          order.cancelledAt = at;
          order.cancelledBy = input.createdBy;
          order.updatedAt = at;
          order.updatedBy = input.createdBy;
        }

        orders.push(order);
      });
    }
  });

  const inventory = Object.fromEntries(seed.branches.map((b) => [b.id, { ...(seed.inventory[b.id] ?? {}) }]));
  markLowStock(seed, inventory, random);
  return { orders, inventory };
};

/**
 * 1-2 item stok yang terjual dibuat menipis (tepat di `lowAt`, masih bisa
 * dijual), supaya Laporan → Stok menipis tidak kosong: satu di cabang
 * terakhir, satu lagi di cabang pertama bila ada 2 cabang atau lebih.
 */
const markLowStock = (seed: DemoSeed, inventory: Record<string, Record<string, number>>, random: () => number) => {
  const sold = new Set(
    seed.products.flatMap((p) => [...(p.consumes ?? []), ...(p.choiceGroups ?? []).flatMap((g) => g.options.flatMap((o) => o.consumes ?? []))]).map((c) => c.stockItemId),
  );
  const pool = seed.stockItems.filter((s) => s.active && sold.has(s.id) && (s.lowAt ?? 0) > 0);
  const branches = seed.branches.filter((b) => b.active);
  if (pool.length === 0 || branches.length === 0) return;
  const targets = [branches[branches.length - 1], ...(branches.length > 1 ? [branches[0]] : [])];
  for (const branch of targets) {
    const item = pool.splice(Math.floor(random() * pool.length), 1)[0];
    if (!item) return;
    (inventory[branch.id] ??= {})[item.id] = item.lowAt!;
  }
};
