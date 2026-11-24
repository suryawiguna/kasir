import { useEffect, useRef } from "react";

/**
 * Tombol Back Android dan Escape menutup overlay paling atas (port dari
 * Haoshii). Setiap overlay terbuka = satu entri history; entri yang tidak
 * lagi dibutuhkan dibuang dalam satu `history.go(-n)` setelah semua efek
 * selesai (rekonsiliasi di microtask), sehingga menutup sheet dalam tidak
 * ikut menutup sheet di bawahnya, dan StrictMode tidak menumpuk entri.
 *
 * Drawer sudah memanggil ini. Jangan panggil lagi untuk Drawer yang sama.
 */
type OpenModal = { close: () => void };

const openModals: OpenModal[] = [];
/** Entri history yang kita dorong dan belum di-pop. */
let pushedDepth = 0;
/** popstate yang kita picu sendiri, bukan Back pengguna. */
let ourPops = 0;
let listening = false;
let reconcileQueued = false;

const handlePopState = () => {
  if (ourPops > 0) {
    ourPops -= 1;
    return;
  }
  if (pushedDepth === 0) return;
  pushedDepth -= 1;
  openModals.pop()?.close();
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  openModals[openModals.length - 1]?.close();
};

const reconcile = () => {
  reconcileQueued = false;
  const desired = openModals.length;
  while (pushedDepth < desired) {
    window.history.pushState({ backClose: true }, "");
    pushedDepth += 1;
  }
  const extra = pushedDepth - desired;
  if (extra <= 0) return;
  // Pengguna sudah berpindah halaman di luar entri kita: jangan mundur.
  if ((window.history.state as { backClose?: boolean } | null)?.backClose !== true) {
    pushedDepth = desired;
    return;
  }
  pushedDepth = desired;
  ourPops += 1;
  window.history.go(-extra);
};

const scheduleReconcile = () => {
  if (reconcileQueued) return;
  reconcileQueued = true;
  queueMicrotask(reconcile);
};

export const useBackClose = (isOpen: boolean, onClose: () => void) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    if (!listening) {
      window.addEventListener("popstate", handlePopState);
      document.addEventListener("keydown", handleKeyDown);
      listening = true;
    }
    const entry: OpenModal = { close: () => onCloseRef.current() };
    openModals.push(entry);
    scheduleReconcile();
    return () => {
      const index = openModals.indexOf(entry);
      if (index !== -1) openModals.splice(index, 1);
      scheduleReconcile();
    };
  }, [isOpen]);
};

/** Ada overlay terbuka? Dipakai untuk menunda update aplikasi. */
export const overlayOpenCount = () => openModals.length;
