import { useEffect, useState } from "react";
import { TRANSITION_MS } from "./useOverlayTransition";

/**
 * Tetap mengembalikan nilai terakhir selama TRANSITION_MS setelah nilainya
 * jadi null. Untuk sheet yang di-gate `{order && <Sheet order={order} />}`:
 * tanpa ini sheet dicabut seketika dan animasi keluar tidak sempat jalan.
 * Pasangkan dengan `open={value != null}`.
 */
export function useLingeringValue<T>(value: T | null): T | null {
  const [lingering, setLingering] = useState(value);
  useEffect(() => {
    if (value != null) {
      setLingering(value);
      return;
    }
    const timeout = setTimeout(() => setLingering(null), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [value]);
  return value ?? lingering;
}
