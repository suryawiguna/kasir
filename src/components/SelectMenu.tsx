import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { useBackClose } from "../features/ui/useBackClose";
import { CountBadge } from "./ui";

/**
 * Dropdown pilihan (port dari Haoshii), pengganti `<select>` bawaan yang
 * tampil beda di setiap HP. Tombolnya memakai spesifikasi `.field-select`;
 * daftarnya kartu dengan baris 44px, membuka ke atas bila ruang di bawah
 * tidak cukup, dan bisa dipakai dengan panah/Tab/Escape/Back.
 */
export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
  count?: string;
  hint?: string;
}

interface SelectMenuProps<T extends string> {
  options: readonly SelectMenuOption<T>[];
  value: T;
  onChange: (value: NoInfer<T>) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
}

const MAX_LIST_HEIGHT = 300;
const GAP = 8;

/** Batas induk terdekat yang memotong (body Drawer menggulir). */
function clippingBounds(el: HTMLElement): { top: number; bottom: number } {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== "visible") {
      const rect = node.getBoundingClientRect();
      return { top: Math.max(rect.top, 0), bottom: Math.min(rect.bottom, window.innerHeight) };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}

export function SelectMenu<T extends string>({
  options,
  value,
  onChange,
  label,
  placeholder,
  disabled,
  className,
  align = "left",
}: SelectMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [maxHeight, setMaxHeight] = useState(MAX_LIST_HEIGHT);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

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
    if (!isOpen) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? panel?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const open = () => {
    const button = buttonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      const bounds = clippingBounds(button);
      const below = bounds.bottom - rect.bottom - GAP;
      const above = rect.top - bounds.top - GAP;
      const wanted = Math.min(options.length * 44 + 8, MAX_LIST_HEIGHT);
      const up = below < wanted && above > below;
      setDropUp(up);
      setMaxHeight(Math.max(Math.min(MAX_LIST_HEIGHT, up ? above : below), 120));
    }
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const focusSibling = (from: HTMLElement, delta: 1 | -1) => {
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(from as HTMLButtonElement);
    buttons[(index + delta + buttons.length) % buttons.length].focus();
  };

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        className={cn(
          "field-select w-full text-left truncate",
          !selected && "font-medium text-zinc-400",
          isOpen && "border-brand-500 ring-2 ring-brand-500/20",
        )}
      >
        {selected ? (
          selected.count === undefined ? (
            selected.label
          ) : (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{selected.label}</span>
              <CountBadge count={selected.count} />
            </span>
          )
        ) : (
          (placeholder ?? "Pilih")
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === "Tab") return setIsOpen(false);
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            focusSibling(event.target as HTMLElement, event.key === "ArrowDown" ? 1 : -1);
          }}
          style={{ maxHeight }}
          className={cn(
            "absolute z-[80] min-w-full w-max max-w-[min(90vw,24rem)] p-1 card shadow-lg overflow-y-auto overscroll-contain",
            align === "right" ? "right-0" : "left-0",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  close();
                  if (!isSelected) onChange(option.value);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 min-h-11 px-3 py-2 rounded-xl text-base font-bold",
                  "transition duration-200 text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                  isSelected ? "bg-brand-50 text-brand-700" : "text-zinc-700 hover:bg-zinc-100",
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate">{option.label}</span>
                    {option.count !== undefined && <CountBadge count={option.count} />}
                  </span>
                  {option.hint && <span className="block text-xs font-medium text-zinc-500">{option.hint}</span>}
                </span>
                <Check size={16} className={cn("shrink-0", !isSelected && "invisible")} aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SelectMenu;
