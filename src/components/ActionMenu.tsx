import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { useBackClose } from "../features/ui/useBackClose";

/**
 * Menu aksi kecil (port dari Haoshii): tombol yang membuka daftar aksi,
 * mis. menu akun di nav, atau aksi jarang di sebuah baris.
 */
export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label: string;
  className?: string;
  trigger?: ReactNode;
  triggerClassName?: (isOpen: boolean) => string;
  placement?: "below" | "right" | "above";
  header?: ReactNode;
}

export function ActionMenu({ items, label, className, trigger, triggerClassName, placement = "below", header }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [fixedAt, setFixedAt] = useState<CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useBackClose(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, [isOpen]);

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    const estimated = items.length * 44 + 16 + (header ? 64 : 0);
    const up = !!rect && rect.bottom + estimated > window.innerHeight;
    setDropUp(up);
    setFixedAt(
      placement === "right" && rect
        ? { left: rect.right + 8, ...(up ? { bottom: window.innerHeight - rect.bottom } : { top: rect.top }) }
        : undefined,
    );
    setIsOpen(true);
  };

  const focusSibling = (from: HTMLElement, delta: 1 | -1) => {
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(from as HTMLButtonElement);
    buttons[(index + delta + buttons.length) % buttons.length].focus();
  };

  return (
    <div ref={rootRef} className={cn("relative", className)} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        className={
          triggerClassName
            ? triggerClassName(isOpen)
            : cn(trigger ? "btn-neutral" : "btn-icon btn-secondary", isOpen && (trigger ? "bg-zinc-200" : "bg-brand-100"))
        }
      >
        {trigger ?? <ChevronDown size={18} className={cn("transition-transform duration-200", isOpen && "rotate-180")} />}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            focusSibling(event.target as HTMLElement, event.key === "ArrowDown" ? 1 : -1);
          }}
          style={fixedAt}
          className={cn(
            "z-[80] min-w-[13rem] p-1 card shadow-lg",
            placement === "right"
              ? "fixed"
              : placement === "above"
                ? "absolute right-0 bottom-full mb-2"
                : cn("absolute right-0", dropUp ? "bottom-full mb-1" : "top-full mt-1"),
          )}
        >
          {header && <div className="px-3 pt-2 pb-3 mb-1 border-b border-zinc-100">{header}</div>}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setIsOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-3 h-11 px-3 rounded-xl text-sm font-bold",
                "transition duration-200 text-left whitespace-nowrap",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                item.danger ? "text-red-700 hover:bg-red-50" : "text-zinc-700 hover:bg-zinc-100",
              )}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ActionMenu;
