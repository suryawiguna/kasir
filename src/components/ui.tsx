import { Check, ChevronRight, CircleCheck, Clock, Minus, Package, Plus, Trash2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { OrderStatus } from "../domain/types";
import { ORDER_STATUS_LABEL } from "../features/orders/buildOrder";
import { cn } from "../lib/cn";
import { Drawer } from "./Drawer";

/**
 * Komponen kecil dari design system Haoshii (docs/DESIGN.md §5), satu file.
 * Komponen besar (Drawer, SelectMenu, ActionMenu) punya file sendiri.
 */

/* ------------------------------------------------------------------ */
/* CountBadge, RowChevron                                              */
/* ------------------------------------------------------------------ */

export function CountBadge({ count, active, className }: { count: string; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-sm font-bold leading-none tabular-nums shrink-0",
        active ? "bg-white text-brand-700" : count === "0" ? "bg-zinc-100 text-zinc-500" : "bg-brand-100 text-brand-700",
        className,
      )}
    >
      {count}
    </span>
  );
}

export const RowChevron = ({ className }: { className?: string }) => (
  <ChevronRight size={20} aria-hidden className={cn("shrink-0 text-zinc-500", className)} />
);

/* ------------------------------------------------------------------ */
/* SegmentedControl                                                    */
/* ------------------------------------------------------------------ */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: string;
}

/**
 * Pilihan 2–5 opsi yang selalu terlihat. `scrollable` untuk daftar yang bisa
 * lebih lebar dari layar (mis. kategori di Kasir).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  scrollable = false,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: NoInfer<T>) => void;
  className?: string;
  scrollable?: boolean;
}) {
  const track = (
    <div
      className={cn(
        "flex bg-white border border-zinc-200 rounded-xl p-0.5",
        scrollable ? "w-max min-w-full lg:min-w-0" : "lg:w-fit",
        !scrollable && className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 lg:flex-none lg:px-4 h-11 rounded-[10px] text-sm lg:text-base font-bold whitespace-nowrap",
            scrollable && "px-4",
            "transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
            value === option.value ? "bg-brand-500 text-brand-fg" : "text-zinc-600 hover:text-zinc-900",
          )}
        >
          {option.count === undefined ? (
            option.label
          ) : (
            <span className="inline-flex items-center justify-center gap-1.5">
              {option.label}
              <CountBadge count={option.count} active={value === option.value} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
  if (!scrollable) return track;
  return (
    <div className={cn("overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>{track}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

/**
 * − jumlah +. Di jumlah minimum, − menjadi tempat sampah merah: tidak ada
 * "0" di keranjang, hanya hapus.
 */
export function Stepper({
  value,
  atMinimum,
  canIncrease = true,
  onDecrease,
  onIncrease,
  onRemove,
  label,
}: {
  value: ReactNode;
  atMinimum: boolean;
  canIncrease?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove?: () => void;
  label: string;
}) {
  const removes = atMinimum && onRemove;
  return (
    <div className="flex items-center bg-zinc-50 rounded-xl p-0.5 shrink-0">
      <button
        type="button"
        onClick={removes ? onRemove : onDecrease}
        aria-label={removes ? `Hapus ${label}` : `Kurangi ${label}`}
        className={cn("btn-icon btn-ghost", removes ? "text-red-500 hover:bg-red-50" : "text-zinc-600 hover:bg-zinc-200")}
      >
        {removes ? <Trash2 size={18} /> : <Minus size={18} />}
      </button>
      <span className="min-w-[1.75rem] px-0.5 text-center text-base md:text-lg font-bold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        aria-label={`Tambah ${label}`}
        title={canIncrease ? undefined : "Stok tidak cukup"}
        className="btn-icon btn-ghost hover:bg-zinc-200"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

/**
 * Label + kontrol + petunjuk/galat. `group` untuk kontrol yang bukan input
 * (SelectMenu, SegmentedControl, grid tombol): `<label>` meneruskan klik ke
 * tombol pertama di dalamnya, jadi kelompok itu memakai `<div>`.
 */
export function Field({
  label,
  hint,
  error,
  group,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  group?: boolean;
  children: ReactNode;
}) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error block">{error}</span> : hint ? <span className="field-hint block">{hint}</span> : null}
    </Tag>
  );
}

/** Saklar on/off. Seluruh baris bisa diketuk. */
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-3 text-left disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-base font-bold text-zinc-900">{label}</span>
        {detail && <span className="block text-sm text-zinc-500">{detail}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-brand-500" : "bg-zinc-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

/** Kotak centang besar dalam kartu tipis (pola "Bayar nanti" Haoshii). */
export function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-[var(--brand-500)] shrink-0"
      />
      <span className="text-sm md:text-base font-medium">{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Empty, Skeleton                                                     */
/* ------------------------------------------------------------------ */

export function Empty({ icon, title, detail, action }: { icon?: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-2 text-zinc-300">{icon}</div>}
      <p className="font-bold text-zinc-700">{title}</p>
      {detail && <p className="max-w-sm text-sm text-zinc-500">{detail}</p>}
      {action}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-lg bg-zinc-200/70", className)} />
);

/* ------------------------------------------------------------------ */
/* Konfirmasi                                                          */
/* ------------------------------------------------------------------ */

/** Dialog konfirmasi: Drawer dialog kecil, aksi di kiri, Batal di kanan (Haoshii). */
export function Confirm({
  open,
  title,
  message,
  confirmLabel,
  tone = "primary",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger" | "warning";
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} variant="dialog" size="xs" title={title}>
      <div className="space-y-4">
        <div className="text-base text-zinc-600">{message}</div>
        <div className="flex flex-col gap-2 lg:flex-row">
          <button
            type="button"
            className={cn(
              "w-full lg:flex-1",
              tone === "danger" ? "btn-danger" : "btn-primary",
              tone === "warning" && "bg-amber-600 text-white hover:bg-amber-700",
            )}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn-neutral w-full lg:flex-1" onClick={onClose}>
            Batal
          </button>
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Status pesanan                                                      */
/* ------------------------------------------------------------------ */

export const STATUS_STYLE: Record<OrderStatus, { color: string; Icon: typeof Clock }> = {
  pending: { color: "bg-amber-100 text-amber-800", Icon: Clock },
  ready: { color: "bg-sky-100 text-sky-800", Icon: Package },
  completed: { color: "bg-emerald-100 text-emerald-800", Icon: CircleCheck },
  cancelled: { color: "bg-zinc-100 text-zinc-500", Icon: XCircle },
};

export function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  const { color, Icon } = STATUS_STYLE[status];
  return (
    <span className={cn("pill", color, className)}>
      <Icon size={14} strokeWidth={status === "completed" ? 3 : 2} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

export function PaidPill({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="pill bg-emerald-100 text-emerald-800">
      <Check size={14} strokeWidth={3} /> Lunas
    </span>
  ) : (
    <span className="pill bg-amber-100 text-amber-800">Belum bayar</span>
  );
}

const STEPS: OrderStatus[] = ["pending", "ready", "completed"];

/**
 * Diproses → Siap → Selesai. Langkah sekarang terisi warnanya, yang lain
 * abu-abu (Haoshii DESIGN.md §5.15).
 */
export function StatusTimeline({ status }: { status: OrderStatus }) {
  const current = STEPS.indexOf(status);
  return (
    <ol className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const { color, Icon } = STATUS_STYLE[step];
        const active = i === current;
        const done = i < current;
        return (
          <li key={step} className="flex flex-1 items-center gap-1">
            <span
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-bold",
                active ? color : done ? "bg-zinc-100 text-zinc-500" : "bg-zinc-50 text-zinc-400",
              )}
            >
              <Icon size={16} />
              {ORDER_STATUS_LABEL[step]}
            </span>
            {i < STEPS.length - 1 && <ChevronRight size={16} className="shrink-0 text-zinc-300" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Navigasi                                                            */
/* ------------------------------------------------------------------ */

export const navItemClass = (active: boolean) =>
  cn(
    "flex items-center gap-3 w-full h-12 px-4 rounded-xl text-base font-bold whitespace-nowrap transition duration-200 active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 [&>svg]:shrink-0",
    active ? "bg-brand-50 text-brand-700" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
  );

export const bottomNavItemClass = (active: boolean) =>
  cn(
    "flex items-start justify-center w-full min-w-0 h-nav-safe pb-safe transition duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40",
    active ? "bg-brand-100 text-brand-700" : "text-zinc-400 hover:text-zinc-600",
  );

export const bottomNavBoxClass = "shrink-0 flex flex-col items-center justify-center gap-1 w-full h-16";

export const bottomNavLabelClass = (active: boolean) => cn("leading-none text-xs", active ? "font-bold" : "font-medium");
