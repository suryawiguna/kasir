import { useCallback, useEffect, useState } from "react";
import { withBase } from "../features/demo/demoId";
import { ROUTE_BASE } from "../features/demo/demo";

/**
 * Satu path per tab. Path lain jatuh ke Kasir.
 *
 * Mode demo: path diawali `/d/{demoId}` (ROUTE_BASE), yang dibuang sebelum
 * mencocokkan dan ditambahkan lagi saat pindah tab. Untuk klien biasa base
 * kosong, jadi perilakunya sama seperti tanpa mode demo.
 */
export const ROUTES = ["/", "/laporan", "/pesanan", "/stok", "/pengaturan"] as const;
export type Route = (typeof ROUTES)[number];

const current = (): Route => {
  let path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (ROUTE_BASE && (path === ROUTE_BASE || path.startsWith(`${ROUTE_BASE}/`))) {
    path = path.slice(ROUTE_BASE.length) || "/";
  }
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : "/";
};

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const onPop = () => setRoute(current());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((next: Route) => {
    if (next === current()) return;
    history.pushState({}, "", withBase(ROUTE_BASE, next));
    setRoute(next);
    document.getElementById("page-scroller")?.scrollTo(0, 0);
  }, []);
  return [route, navigate];
}
