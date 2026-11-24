import { useSyncExternalStore } from "react";

/**
 * True dari breakpoint `lg` Tailwind (1024px). Untuk memilih satu cabang
 * render saat runtime, alih-alih merender dua lalu menyembunyikan satu
 * dengan CSS (CSS menyembunyikan, tidak berhenti membangun).
 */
const QUERY = "(min-width: 1024px)";
let mediaQuery: MediaQueryList | null = null;
const list = () => (mediaQuery ??= window.matchMedia(QUERY));

const subscribe = (onChange: () => void) => {
  const mql = list();
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

export const useIsDesktop = () => useSyncExternalStore(subscribe, () => list().matches, () => false);
