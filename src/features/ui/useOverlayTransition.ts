import { useLayoutEffect, useState } from "react";

/** Durasi masuk dan keluar setiap overlay. Satu angka untuk diubah. */
export const TRANSITION_MS = 200;

/**
 * Menggerakkan overlay dari satu boolean `open` (port dari Haoshii).
 *
 * `host` adalah `<div>` baru yang ditambahkan ke `<body>` setiap kali overlay
 * dibuka. Semua Drawer di satu z-index, jadi urutan DOM = urutan dibuka: yang
 * terbaru selalu di atas, tanpa angka z-index per pemanggil.
 *
 * `host` tetap ada selama TRANSITION_MS setelah ditutup supaya animasi keluar
 * sempat jalan. `visible` menyala dua frame setelah host masuk halaman, supaya
 * browser sempat menggambar posisi tertutup dulu.
 */
export function useOverlayTransition(open: boolean) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const layer = document.createElement("div");
    document.body.appendChild(layer);
    setHost(layer);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      setVisible(false);
      window.setTimeout(() => {
        layer.remove();
        setHost((current) => (current === layer ? null : current));
      }, TRANSITION_MS);
    };
  }, [open]);

  return { host, visible };
}
