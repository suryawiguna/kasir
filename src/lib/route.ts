import { useCallback, useEffect, useState } from "react";

/** Empat tab, empat path. Path lain jatuh ke Kasir. */
export const ROUTES = ["/", "/pesanan", "/stok", "/pengaturan"] as const;
export type Route = (typeof ROUTES)[number];

const current = (): Route => {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
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
    history.pushState({}, "", next);
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);
  return [route, navigate];
}
