import clsx from "clsx";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Back/Escape menutup overlay paling atas                             */
/* ------------------------------------------------------------------ */

interface OverlayEntry {
  id: string;
  close: () => void;
  closedByBack: boolean;
}

const stack: OverlayEntry[] = [];
/** popstate yang kita picu sendiri (menutup lewat tombol), bukan Back pengguna. */
let suppressPops = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (suppressPops > 0) {
      suppressPops -= 1;
      return;
    }
    const top = stack[stack.length - 1];
    if (top) {
      top.closedByBack = true;
      top.close();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") stack[stack.length - 1]?.close();
  });
}

/**
 * Setiap overlay yang terbuka mendorong satu entri history, sehingga tombol
 * Back di Android menutup sheet alih-alih keluar dari aplikasi. Escape
 * menutup yang paling atas. Satu listener global, supaya menutup sheet dalam
 * tidak ikut menutup sheet di bawahnya.
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry: OverlayEntry = { id, close: () => closeRef.current(), closedByBack: false };
    stack.push(entry);
    history.pushState({ overlay: id }, "");
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      if (!entry.closedByBack) {
        suppressPops += 1;
        history.back();
      }
    };
  }, [open, id]);
}

export const overlayOpenCount = () => stack.length;

/* ------------------------------------------------------------------ */
/* Drawer: bottom sheet di HP, popup di tengah dari lg                  */
/* ------------------------------------------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useBackClose(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onClose} />
      <div
        className={clsx(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl lg:rounded-2xl",
          wide ? "lg:max-w-3xl" : "lg:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost h-9 w-9 px-0" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-zinc-100 px-4 py-3 pb-safe">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Konfirmasi                                                          */
/* ------------------------------------------------------------------ */

export function Confirm({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>
            Batal
          </button>
          <button
            className={clsx(danger ? "btn-danger" : "btn-primary", "flex-1")}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-sm text-zinc-700">{message}</div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Kontrol kecil                                                       */
/* ------------------------------------------------------------------ */

export function Stepper({
  value,
  onMinus,
  onPlus,
  plusDisabled,
  label,
}: {
  value: ReactNode;
  onMinus: () => void;
  onPlus: () => void;
  plusDisabled?: boolean;
  label: string;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white">
      <button className="flex h-9 w-9 items-center justify-center" onClick={onMinus} aria-label={`Kurangi ${label}`}>
        <Minus size={16} />
      </button>
      <span className="min-w-10 px-1 text-center text-sm font-semibold tabular">{value}</span>
      <button
        className="flex h-9 w-9 items-center justify-center disabled:opacity-40"
        onClick={onPlus}
        disabled={plusDisabled}
        aria-label={`Tambah ${label}`}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-zinc-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            "h-9 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors",
            value === o.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  detail,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  detail?: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx("flex items-start justify-between gap-3 py-2", disabled && "opacity-50")}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {detail && <span className="block text-xs text-zinc-500">{detail}</span>}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 accent-[var(--brand-600)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {detail && <p className="max-w-sm text-sm text-zinc-500">{detail}</p>}
      {action}
    </div>
  );
}
