import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { IS_DEMO, STORAGE_SLUG } from "../demo/demo";
import { useShop } from "../shop/ShopContext";
import { demoDeviceSetup, deviceSetupKey, effectiveSetup, parseDeviceSetup, type DeviceSetup } from "./deviceSetup";

interface DeviceState {
  /** Setup yang berlaku, atau null bila perangkat perlu disetup. */
  setup: DeviceSetup | null;
  save: (setup: DeviceSetup) => void;
  clear: () => void;
}

const DeviceContext = createContext<DeviceState | null>(null);

/**
 * Mode demo: halaman setup perangkat tidak pernah tampil. Cabang aktif
 * pertama dan huruf acak dipilih otomatis dan disimpan, per demo.
 */
export function DeviceProvider({ children }: { children: ReactNode }) {
  const { claims } = useAuth();
  const { branches } = useShop();
  const key = deviceSetupKey(STORAGE_SLUG);
  const [stored, setStored] = useState<DeviceSetup | null>(() => parseDeviceSetup(localStorage.getItem(key)));
  const [random] = useState(() => Math.random());

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
  const setup = IS_DEMO
    ? demoDeviceSetup(stored, activeIds, random)
    : claims?.role
      ? effectiveSetup(stored, claims.role, claims.branchId, activeIds)
      : null;

  // Simpan setup otomatis demo, supaya huruf perangkat tetap saat dimuat ulang.
  const autoSaved = IS_DEMO && setup && (setup.branchId !== stored?.branchId || setup.deviceLetter !== stored?.deviceLetter);
  useEffect(() => {
    if (autoSaved && setup) save(setup);
  }, [autoSaved, setup, save]);

  const value = useMemo(() => ({ setup, save, clear }), [setup, save, clear]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export const useDevice = (): DeviceState => {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error("useDevice di luar DeviceProvider");
  return ctx;
};
