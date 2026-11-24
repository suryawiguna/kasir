import { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/**
 * Geser header bottom sheet ke bawah untuk menutup (port dari Haoshii).
 * Hanya header, tidak pernah body (body menggulir dan berisi form). Ketukan
 * tombol di header tetap jalan: baru dianggap geser setelah 8px, dan hanya
 * gerakan yang benar-benar bergeser yang menelan klik berikutnya. HP saja.
 */
const START_PX = 8;
const CLOSE_RATIO = 0.25;
const FLICK_SPEED = 0.5;

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

export const useDragToClose = (onClose: () => void, enabled: boolean) => {
  const [dragY, setDragY] = useState<number | null>(null);
  const swallowClick = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    swallowClick.current = false;
    if (!enabled || isDesktop() || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const panel = e.currentTarget.closest<HTMLElement>("[role='dialog']");
    const height = panel?.offsetHeight ?? window.innerHeight;
    const id = e.pointerId;
    const startY = e.clientY;
    let lastY = startY;
    let lastT = e.timeStamp;
    let speed = 0;
    let dragging = false;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dy = ev.clientY - startY;
      if (!dragging) {
        if (dy < START_PX) return;
        dragging = true;
      }
      const dt = ev.timeStamp - lastT;
      if (dt > 0) speed = (ev.clientY - lastY) / dt;
      lastY = ev.clientY;
      lastT = ev.timeStamp;
      setDragY(Math.max(0, dy));
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!dragging) return;
      swallowClick.current = true;
      const dy = Math.max(0, ev.clientY - startY);
      setDragY(null);
      if (ev.type === "pointerup" && (dy > height * CLOSE_RATIO || speed > FLICK_SPEED)) onClose();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  return { dragY, handleProps: enabled ? { onPointerDown, onClickCapture } : { onClickCapture } };
};
