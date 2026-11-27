import { getDocs, limit, onSnapshot, orderBy, query, startAfter, where, type QueryDocumentSnapshot, type QuerySnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shopCol } from "../../data/paths";
import type { Order } from "../../domain/types";

/**
 * Pesanan untuk tab Laporan. Hanya hidup selama tab terbuka (dipasang oleh
 * ReportsPage); keluar tab = listener dilepas dan data dibuang. Biaya di
 * docs/QUOTA.md.
 *
 * Satu jendela untuk semua cabang, diperlebar ke belakang bila perlu:
 * - **Hari ini** (`>= todayStart`) lewat listener, jadi penjualan baru dari
 *   semua perangkat langsung masuk.
 * - **Hari-hari sebelumnya** dibaca sekali (`getDocs`, berhalaman 1000) sampai
 *   habis, hanya bagian yang belum dimuat. Ganti rentang ke yang lebih pendek
 *   atau ganti cabang = 0 baca (cabang difilter di klien).
 *
 * Dua query per bagian karena Firestore tidak bisa OR antar field: `createdAt`
 * (semua pesanan yang dibuat di rentang) dan `paidAt` (pesanan "bayar nanti"
 * yang dibuat sebelum rentang tapi dibayar di dalamnya; hanya pesanan yang
 * dibayar belakangan punya `paidAt`, jadi biasanya sedikit). Keduanya memakai
 * indeks satu field otomatis, tanpa indeks gabungan.
 */
export const REPORT_PAGE_SIZE = 1000;
/** Batas per field per bagian. Lebih dari ini = laporan ditandai terpotong. */
export const REPORT_MAX_ORDERS = 20_000;

type Field = "createdAt" | "paidAt";

const fetchSegment = async (field: Field, from: string, to: string) => {
  const out: Order[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  for (;;) {
    const snap: QuerySnapshot = await getDocs(
      query(shopCol("orders"), where(field, ">=", from), where(field, "<", to), orderBy(field), ...(cursor ? [startAfter(cursor)] : []), limit(REPORT_PAGE_SIZE)),
    );
    for (const d of snap.docs) out.push({ ...(d.data() as Order), id: d.id });
    if (snap.size < REPORT_PAGE_SIZE) return { orders: out, capped: false };
    if (out.length >= REPORT_MAX_ORDERS) return { orders: out, capped: true };
    cursor = snap.docs[snap.docs.length - 1];
  }
};

export interface ReportOrders {
  orders: Order[];
  /** Jendela yang diminta sudah lengkap. Sebelum itu jangan tampilkan angka. */
  ready: boolean;
  failed: boolean;
  truncated: boolean;
  retry: () => void;
}

/**
 * @param todayStart awal hari bisnis ini (ISO), batas listener.
 * @param needFrom awal data yang dibutuhkan (ISO): `prevFrom` rentang yang dipilih.
 */
export function useReportOrders(todayStart: string, needFrom: string): ReportOrders {
  const [head, setHead] = useState<{ created: Order[] | null; paid: Order[] | null }>({ created: null, paid: null });
  const [history, setHistory] = useState<Map<string, Order>>(() => new Map());
  // Batas bawah yang sudah dimuat. Awalnya todayStart: belum ada riwayat.
  const [loadedFrom, setLoadedFrom] = useState(todayStart);
  const [failed, setFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const loading = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const listen = (field: Field) =>
      onSnapshot(
        query(shopCol("orders"), where(field, ">=", todayStart), orderBy(field)),
        (snap) => {
          const orders = snap.docs.map((d) => ({ ...(d.data() as Order), id: d.id }));
          setHead((h) => ({ ...h, [field === "createdAt" ? "created" : "paid"]: orders }));
        },
        (error) => {
          if (import.meta.env.DEV) console.error("laporan", error);
          setFailed(true);
        },
      );
    const a = listen("createdAt");
    const b = listen("paidAt");
    return () => {
      a();
      b();
    };
  }, [todayStart, attempt]);

  useEffect(() => {
    if (needFrom >= loadedFrom || loading.current || failed) return;
    loading.current = true;
    const from = needFrom;
    const to = loadedFrom;
    Promise.all([fetchSegment("createdAt", from, to), fetchSegment("paidAt", from, to)])
      .then(([created, paid]) => {
        setHistory((prev) => {
          const next = new Map(prev);
          for (const o of [...created.orders, ...paid.orders]) next.set(o.id, o);
          return next;
        });
        if (created.capped || paid.capped) setTruncated(true);
        setLoadedFrom(from);
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.error("laporan", error);
        setFailed(true);
      })
      .finally(() => {
        loading.current = false;
      });
  }, [needFrom, loadedFrom, failed]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  const orders = useMemo(() => {
    const all = new Map(history);
    // Salinan listener lebih baru dari salinan riwayat.
    for (const o of head.paid ?? []) all.set(o.id, o);
    for (const o of head.created ?? []) all.set(o.id, o);
    return [...all.values()];
  }, [head, history]);

  return {
    orders,
    ready: head.created !== null && head.paid !== null && loadedFrom <= needFrom,
    failed,
    truncated,
    retry,
  };
}
