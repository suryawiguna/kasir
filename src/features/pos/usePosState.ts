import { useCallback, useEffect, useMemo, useState } from "react";
import { CLIENT } from "../../client";
import { newId } from "../../data/paths";
import type { LineChoice, Order, OrderType, PaymentMethod, Product } from "../../domain/types";
import { getBusinessDateCompact } from "../../lib/businessDate";
import { useAuth } from "../auth/AuthContext";
import { useDevice } from "../device/DeviceContext";
import { lastSequenceKey } from "../device/deviceSetup";
import { useBranch } from "../orders/BranchContext";
import { buildOrder } from "../orders/buildOrder";
import { commitCheckout } from "../orders/orderActions";
import { buildOrderNumber, nextSequence } from "../orders/orderNumber";
import { sumTotals } from "../pricing/pricing";
import { setTillBusy } from "../pwa/appUpdate";
import { useShop } from "../shop/ShopContext";
import { consumptionForLine, findShortages, fitsInStock, totalConsumed, type Shortage } from "../stock/consumption";
import { findUnit, stepBase } from "../units/units";
import {
  addToCart,
  cartProblem,
  priceCart,
  sellableProducts,
  setLineQuantity,
  stepLine,
  tillProduct,
  toOrderLines,
  type CartLine,
} from "./cart";

export interface CheckoutRequest {
  orderType: OrderType;
  payment: { method: PaymentMethod; cashReceived?: number } | null;
  customerName?: string;
  customerContact?: string;
  pickupTime?: string;
  /** Lanjut walau stok kurang (hanya bila kebijakan toko "warn"). */
  overrideStock?: boolean;
}

export type CheckoutOutcome =
  | { ok: true; order: Order }
  | { ok: false; message: string; shortages?: Shortage[] };

const draftKey = (branchId: string) => `${CLIENT.slug}:cart:${branchId}`;

const loadDraft = (branchId: string): CartLine[] => {
  try {
    const raw = localStorage.getItem(draftKey(branchId));
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l.productId === "string" && l.quantity > 0) : [];
  } catch {
    return [];
  }
};

/**
 * Semua state kasir. Komponen hanya menggambar; aturan ada di cart.ts dan
 * consumption.ts.
 */
export function usePosState() {
  const { config, features, categories, products: shopProducts, stockItems } = useShop();
  const { setup } = useDevice();
  const { branch, inventory, orders, isCheckoutReady } = useBranch();
  const { user } = useAuth();
  const branchId = setup?.branchId ?? "";
  const [cart, setCart] = useState<CartLine[]>(() => loadDraft(branchId));

  // Produk versi kasir: fitur produk yang dimatikan (stok, harga cabang, bonus) tidak berlaku.
  const { stockTracking, branchPricing, freeItems } = features;
  const products = useMemo(
    () => shopProducts.map((p) => tillProduct(p, { stockTracking, branchPricing, freeItems })),
    [shopProducts, stockTracking, branchPricing, freeItems],
  );
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    localStorage.setItem(draftKey(branchId), JSON.stringify(cart));
    setTillBusy(cart.length > 0);
  }, [cart, branchId]);
  useEffect(() => () => setTillBusy(false), []);

  const catalog = useMemo(() => ({ productsById, units: config.units, branchId }), [productsById, config.units, branchId]);
  const priced = useMemo(() => priceCart(cart, catalog), [cart, catalog]);
  const total = sumTotals(priced);
  const levels = useMemo(() => inventory?.levels ?? {}, [inventory]);
  const cartConsumed = useMemo(() => totalConsumed(priced), [priced]);

  /** Produk yang tampil di kasir cabang ini, sesuai fitur yang menyala. */
  const sellable = useMemo(
    () =>
      sellableProducts(products, {
        branchId,
        hiddenCategoryIds: new Set(categories.filter((c) => !c.active).map((c) => c.id)),
        weightSales: features.weightSales,
        bundles: features.bundles,
      }),
    [products, categories, branchId, features.weightSales, features.bundles],
  );

  /** Konsumsi bila ditambah sejumlah ini, untuk cek saat tap. */
  const extraFor = useCallback(
    (product: Product, quantity: number, choices?: LineChoice[]) =>
      consumptionForLine({
        product,
        quantity,
        factor: findUnit(config.units, product.unit).factor,
        choices,
        productsById,
      }),
    [config.units, productsById],
  );

  const fits = useCallback(
    (product: Product, quantity: number, choices?: LineChoice[]) =>
      fitsInStock(levels, cartConsumed, extraFor(product, quantity, choices)),
    [levels, cartConsumed, extraFor],
  );

  const blockOnStock = stockTracking && config.stockPolicy === "block";

  const add = useCallback(
    (product: Product, quantity?: number, choices?: LineChoice[]) => {
      const qty = quantity ?? stepBase(findUnit(config.units, product.unit));
      setCart((c) => addToCart(c, product, qty, choices));
    },
    [config.units],
  );

  const step = useCallback(
    (key: string, direction: 1 | -1) => setCart((c) => stepLine(c, key, direction, catalog)),
    [catalog],
  );
  const setQuantity = useCallback((key: string, q: number) => setCart((c) => setLineQuantity(c, key, q)), []);
  const clear = useCallback(() => setCart([]), []);

  const checkout = useCallback(
    (req: CheckoutRequest): CheckoutOutcome => {
      if (!isCheckoutReady || !branch || !setup) {
        return { ok: false, message: "Data cabang belum siap. Tunggu sebentar lalu coba lagi." };
      }
      if (!user?.email) return { ok: false, message: "Sesi berakhir. Masuk lagi." };
      const problem = cartProblem(priced, branchId);
      if (problem) return { ok: false, message: problem };
      const shortages = stockTracking ? findShortages(levels, cartConsumed, stockItems, config.units) : [];
      if (shortages.length && (blockOnStock || !req.overrideStock)) {
        return { ok: false, message: "Stok tidak cukup.", shortages };
      }

      const seqKey = lastSequenceKey(CLIENT.slug, branchId, setup.deviceLetter);
      const lastIssued = Number(localStorage.getItem(seqKey)) || 0;
      const sequence = nextSequence(orders, branch.code, setup.deviceLetter, lastIssued);
      const now = new Date();
      const orderNumber = buildOrderNumber(
        getBusinessDateCompact(config.timezone, now),
        branch.code,
        setup.deviceLetter,
        sequence,
      );
      const result = buildOrder({
        id: newId("orders"),
        orderNumber,
        branchId,
        deviceLetter: setup.deviceLetter,
        items: toOrderLines(priced, productsById, () => newId("orders")),
        orderType: req.orderType,
        instantStatus: config.instantStatus,
        payment: req.payment,
        customerName: features.customers || req.orderType === "preorder" ? req.customerName : undefined,
        customerContact: features.customers ? req.customerContact : undefined,
        pickupTime: req.pickupTime,
        createdBy: user.email,
        now: now.toISOString(),
      });
      if (!result.ok) return result;

      // Tidak di-await: pesanan sudah ada di cache lokal dan listener saat ini.
      commitCheckout(result.order);
      localStorage.setItem(seqKey, String(sequence));
      setCart([]);
      return result;
    },
    [
      isCheckoutReady,
      branch,
      setup,
      user,
      priced,
      branchId,
      levels,
      cartConsumed,
      stockItems,
      config,
      blockOnStock,
      orders,
      productsById,
      features.customers,
      stockTracking,
    ],
  );

  return {
    cart,
    priced,
    total,
    levels,
    sellable,
    fits,
    blockOnStock,
    add,
    step,
    setQuantity,
    clear,
    checkout,
    isCheckoutReady,
  };
}

export type PosState = ReturnType<typeof usePosState>;
