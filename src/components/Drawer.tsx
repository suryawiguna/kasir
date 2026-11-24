import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { useBackClose } from "../features/ui/useBackClose";
import { useDragToClose } from "../features/ui/useDragToClose";
import { TRANSITION_MS, useOverlayTransition } from "../features/ui/useOverlayTransition";

/**
 * Satu-satunya overlay di aplikasi (port dari Haoshii): bottom sheet di HP,
 * dialog di tengah dari `lg`, atau di tengah di semua lebar dengan
 * `variant="dialog"`.
 *
 * Dirender lewat portal ke `<body>`, sehingga tidak ada `space-y-*`,
 * transform, atau overflow induk yang menggeser posisi fixed-nya. Header
 * sheet di HP bisa digeser ke bawah untuk menutup; body menggulir. Back dan
 * Escape ditangani di sini (jangan panggil useBackClose lagi).
 *
 * Fokus awal: tandai field dengan `data-autofocus`, bukan `autoFocus`. Panel
 * masih `inert` saat dipasang (menunggu transisi), sehingga `autoFocus` React
 * diam-diam gagal; Drawer memfokuskannya begitu panel terlihat.
 */
export const CLOSE_ICON_SIZE = 28;
export { TRANSITION_MS };

const DURATION = { transitionDuration: `${TRANSITION_MS}ms` };

/** Semua overlay di satu tingkat; urutan buka yang menentukan tumpukan. */
const Z_INDEX = "z-[60]";

const SIZES = {
  xs: "max-w-sm lg:max-w-lg",
  sm: "lg:max-w-md",
  md: "lg:max-w-[520px]",
  lg: "lg:max-w-2xl",
} as const;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  variant?: "sheet" | "dialog";
  size?: keyof typeof SIZES;
  title?: ReactNode;
  /** Mengganti bar judul seluruhnya. */
  header?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}

export function Drawer({
  open,
  onClose,
  variant = "sheet",
  size = "md",
  title,
  header,
  footer,
  bodyClassName = "p-4",
  panelClassName,
  children,
}: DrawerProps) {
  useBackClose(open, onClose);
  const isSheet = variant === "sheet";
  const { host, visible } = useOverlayTransition(open);
  const { dragY, handleProps } = useDragToClose(onClose, isSheet && visible);
  const isDragging = dragY !== null;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [visible]);

  if (!host) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex justify-center",
        Z_INDEX,
        !visible && "pointer-events-none",
        isSheet ? "items-end lg:items-center lg:p-4" : "items-center p-4",
      )}
      onClick={onClose}
      inert={!visible}
    >
      {/* Backdrop terpisah dari panel, supaya fade-nya tidak membuat panel
          tembus pandang selama meluncur. Blur 2px saja: blur dihitung ulang
          di setiap frame. */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={isDragging ? { transitionDuration: "0ms", opacity: Math.max(0, 1 - dragY / 400) } : DURATION}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        style={isDragging ? { transitionDuration: "0ms", translate: `0 ${dragY}px` } : DURATION}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative bg-white w-full flex flex-col overflow-hidden max-h-[92dvh] lg:max-h-[90vh] transition ease-out",
          isSheet
            ? cn(
                "rounded-t-2xl lg:rounded-xl",
                visible
                  ? "translate-y-0 lg:scale-100 lg:opacity-100"
                  : "translate-y-full lg:translate-y-0 lg:scale-95 lg:opacity-0",
              )
            : cn("rounded-xl", visible ? "scale-100 opacity-100" : "scale-95 opacity-0"),
          SIZES[size],
          panelClassName,
        )}
      >
        <div className={cn("shrink-0", isSheet && "touch-none lg:touch-auto")} {...handleProps}>
          {isSheet && <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-200 lg:hidden" />}
          {header ??
            (title != null && (
              <div className="shrink-0 px-4 pt-2 pb-3 lg:pt-3 border-b border-zinc-100">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-xl truncate">{title}</h3>
                  <button onClick={onClose} aria-label="Tutup" className="btn-icon btn-ghost -mr-2">
                    <X size={CLOSE_ICON_SIZE} />
                  </button>
                </div>
              </div>
            ))}
        </div>
        <div className={cn("flex-1 overflow-y-auto overscroll-contain", bodyClassName)}>{children}</div>
        {footer && <div className="shrink-0 border-t border-zinc-100 bg-white px-4 pt-3 pb-safe-3">{footer}</div>}
      </div>
    </div>,
    host,
  );
}

export default Drawer;
