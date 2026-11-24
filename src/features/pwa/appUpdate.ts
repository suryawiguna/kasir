import { registerSW } from "virtual:pwa-register";

/**
 * Update aplikasi hanya saat kasir tidak sibuk. Mode "prompt" membuat worker
 * baru menunggu; kita memasangnya ketika keranjang kosong dan tidak ada sheet
 * yang terbuka, tanpa pernah menampilkan prompt. Me-reload di tengah pesanan
 * menghilangkan layar kasir.
 */
let busy = false;
let pending: ((reload?: boolean) => Promise<void>) | null = null;

const tryApply = () => {
  if (!pending || busy) return;
  const apply = pending;
  pending = null;
  void apply(true);
};

export const setTillBusy = (value: boolean) => {
  busy = value;
  if (!value) tryApply();
};

export const registerAppUpdates = () => {
  if (import.meta.env.DEV) return;
  const update = registerSW({
    onNeedRefresh() {
      pending = update;
      tryApply();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Cek versi baru tiap 30 menit dan saat aplikasi kembali ke depan.
      setInterval(() => void registration.update().catch(() => undefined), 30 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
      });
    },
  });
};
