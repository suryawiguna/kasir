import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CLIENT } from "../../client";
import { useAuth } from "../auth/AuthContext";
import { useShop } from "../shop/ShopContext";
import { deviceSetupKey, effectiveSetup, parseDeviceSetup, type DeviceSetup } from "./deviceSetup";

interface DeviceState {
  /** Setup yang berlaku, atau null bila perangkat perlu disetup. */
  setup: DeviceSetup | null;
  save: (setup: DeviceSetup) => void;
  clear: () => void;
}

const DeviceContext = createContext<DeviceState | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const { claims } = useAuth();
  const { branches } = useShop();
  const key = deviceSetupKey(CLIENT.slug);
  const [stored, setStored] = useState<DeviceSetup | null>(() => parseDeviceSetup(localStorage.getItem(key)));

  const save = useCallback(
    (next: DeviceSetup) => {
      localStorage.setItem(key, JSON.stringify(next));
      setStored(next);
    },
    [key],
  );
  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setStored(null);
  }, [key]);

  const activeIds = useMemo(() => branches.filter((b) => b.active).map((b) => b.id), [branches]);
  const setup =
    claims?.role ? effectiveSetup(stored, claims.role, claims.branchId, activeIds) : null;

  const value = useMemo(() => ({ setup, save, clear }), [setup, save, clear]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export const useDevice = (): DeviceState => {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDevice di luar DeviceProvider");
  return ctx;
};
