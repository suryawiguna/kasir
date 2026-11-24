import { onSnapshot, type DocumentData, type QuerySnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CLIENT } from "../../client";
import { shopCol, shopSingleton } from "../../data/paths";
import type { Branch, Category, Product, ShopConfig, StockItem } from "../../domain/types";
import { DEFAULT_FEATURES, parseFeatures, type FeatureFlags } from "../settings/featureFlags";
import { applyBrand, readBrand, writeBrand } from "./brandCache";
import { parseShopConfig } from "./shopConfig";

/**
 * Data toko yang dibaca semua layar: config, fitur, cabang, kategori, item
 * stok, produk. Koleksinya kecil (puluhan dokumen), jadi listener biasa.
 * Pesanan dan stok per cabang ada di BranchContext.
 *
 * Tidak ada seeding dari aplikasi. Toko baru diisi oleh `npm run seed`, dan
 * snapshot kosong dari cache ("belum ada yang di-cache") tidak pernah dianggap
 * "tidak ada data" (pelajaran Haoshii).
 */
interface ShopState {
  config: ShopConfig;
  features: FeatureFlags;
  branches: Branch[];
  categories: Category[];
  stockItems: StockItem[];
  products: Product[];
  productsById: Map<string, Product>;
  /** Semua listener sudah menerima jawaban dari server setidaknya sekali (atau cache yang berisi). */
  loaded: boolean;
}

const ShopContext = createContext<ShopState | null>(null);

const byOrder = <T extends { order: number; name?: string }>(a: T, b: T) =>
  a.order - b.order || (a.name ?? "").localeCompare(b.name ?? "");

const listOf = <T,>(snap: QuerySnapshot<DocumentData>): T[] =>
  snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));

export function ShopProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [config, setConfig] = useState<ShopConfig>(() => parseShopConfig(readBrand() ?? undefined, CLIENT.name));
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    const markLoaded = (key: string, fromCache: boolean, empty: boolean) => {
      if (fromCache && empty) return;
      setLoadedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    };
    const onError = (key: string) => (error: Error) => {
      if (import.meta.env.DEV) console.error(key, error);
      setLoadedKeys((prev) => new Set(prev).add(key));
    };
    // Lihat BranchContext: snapshot kosong yang dikonfirmasi server hanya
    // berubah metadata, jadi tanpa ini toko baru tertahan di layar muat.
    const META = { includeMetadataChanges: true };
    const unsubs = [
      onSnapshot(
        shopSingleton("config", "shop"),
        META,
        (snap) => {
          const next = parseShopConfig(snap.data(), CLIENT.name);
          setConfig(next);
          if (snap.exists()) writeBrand({ name: next.name, brandColor: next.brandColor, logoUrl: next.logoUrl });
          markLoaded("config", snap.metadata.fromCache, !snap.exists());
        },
        onError("config"),
      ),
      onSnapshot(
        shopSingleton("settings", "features"),
        META,
        (snap) => {
          setFeatures(parseFeatures(snap.data()));
          markLoaded("features", snap.metadata.fromCache, !snap.exists());
        },
        onError("features"),
      ),
      onSnapshot(
        shopCol("branches"),
        META,
        (snap) => {
          setBranches(listOf<Branch>(snap).sort(byOrder));
          markLoaded("branches", snap.metadata.fromCache, snap.empty);
        },
        onError("branches"),
      ),
      onSnapshot(
        shopCol("categories"),
        META,
        (snap) => {
          setCategories(listOf<Category>(snap).sort(byOrder));
          markLoaded("categories", snap.metadata.fromCache, snap.empty);
        },
        onError("categories"),
      ),
      onSnapshot(
        shopCol("stockItems"),
        META,
        (snap) => {
          setStockItems(listOf<StockItem>(snap).sort(byOrder));
          markLoaded("stockItems", snap.metadata.fromCache, snap.empty);
        },
        onError("stockItems"),
      ),
      onSnapshot(
        shopCol("products"),
        META,
        (snap) => {
          setProducts(listOf<Product>(snap).sort(byOrder));
          markLoaded("products", snap.metadata.fromCache, snap.empty);
        },
        onError("products"),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [enabled]);

  useEffect(() => applyBrand(config.brandColor), [config.brandColor]);
  useEffect(() => {
    document.title = config.name;
  }, [config.name]);

  const value = useMemo<ShopState>(
    () => ({
      config,
      features,
      branches,
      categories,
      stockItems,
      products,
      productsById: new Map(products.map((p) => [p.id, p])),
      loaded: ["config", "features", "branches"].every((k) => loadedKeys.has(k)),
    }),
    [config, features, branches, categories, stockItems, products, loadedKeys],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = (): ShopState => {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop di luar ShopProvider");
  return ctx;
};
