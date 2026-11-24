import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { shopCol, shopDoc } from "../../data/paths";
import type { Branch, BranchInventory, Order } from "../../domain/types";
import { useShop } from "../shop/ShopContext";

/**
 * Data satu cabang untuk kasir: stok (`inventory/{branchId}`, satu dokumen,
 * satu listener) dan 100 pesanan terakhir cabang itu.
 *
 * `isCheckoutReady` salah sampai daftar pesanan nyata (snapshot kosong dari
 * cache tidak dihitung) dan dokumen stok ada: nomor pesanan dihitung dari
 * pesanan di memori dan cek stok membaca `inventory`. Sebelum itu, draf yang
 * dipulihkan bisa bernomor 0001 dan dicek terhadap stok kosong (pelajaran
 * Haoshii).
 */
interface BranchState {
  branch: Branch | null;
  inventory: BranchInventory | null;
  inventoryMissing: boolean;
  orders: Order[];
  isCheckoutReady: boolean;
}

const BranchContext = createContext<BranchState | null>(null);

export const ORDER_WINDOW = 100;

export function BranchProvider({ branchId, children }: { branchId: string; children: ReactNode }) {
  const { branches } = useShop();
  const [inventory, setInventory] = useState<BranchInventory | null>(null);
  const [inventoryMissing, setInventoryMissing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersReal, setOrdersReal] = useState(false);

  useEffect(() => {
    setInventory(null);
    setOrders([]);
    setOrdersReal(false);
    setInventoryMissing(false);
    // includeMetadataChanges: snapshot kosong dari cache yang lalu dikonfirmasi
    // server hanya berubah metadata-nya; tanpa opsi ini callback tidak dipanggil
    // lagi dan kasir menunggu selamanya di cabang yang belum punya pesanan.
    const meta = { includeMetadataChanges: true };
    const unInv = onSnapshot(
      shopDoc("inventory", branchId),
      meta,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<BranchInventory>;
          setInventory({ levels: data.levels ?? {}, updatedAt: data.updatedAt, updatedBy: data.updatedBy });
          setInventoryMissing(false);
        } else if (!snap.metadata.fromCache) {
          setInventory(null);
          setInventoryMissing(true);
        }
      },
      () => setInventoryMissing(true),
    );
    const unOrders = onSnapshot(
      query(shopCol("orders"), where("branchId", "==", branchId), orderBy("createdAt", "desc"), limit(ORDER_WINDOW)),
      meta,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ ...(d.data() as Order), id: d.id })));
        if (!snap.metadata.fromCache || !snap.empty) setOrdersReal(true);
      },
      (error) => {
        if (import.meta.env.DEV) console.error("orders", error);
        setOrdersReal(true);
      },
    );
    return () => {
      unInv();
      unOrders();
    };
  }, [branchId]);

  const branch = branches.find((b) => b.id === branchId) ?? null;
  const value = useMemo<BranchState>(
    () => ({
      branch,
      inventory,
      inventoryMissing,
      orders,
      isCheckoutReady: ordersReal && inventory !== null && branch !== null,
    }),
    [branch, inventory, inventoryMissing, orders, ordersReal],
  );
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export const useBranch = (): BranchState => {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch di luar BranchProvider");
  return ctx;
};
