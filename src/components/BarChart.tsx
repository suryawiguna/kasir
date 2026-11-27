import { useState } from "react";
import { cn } from "../lib/cn";

/**
 * Grafik batang tanpa library: div + flex, warna dari token brand. Bertumpuk
 * bila ada lebih dari satu seri (mis. per cabang). Ketuk batang untuk melihat
 * nilainya; tanpa pilihan, yang tampil batang tertinggi.
 */
export interface BarSeries {
  id: string;
  label: string;
  /** Class latar, mis. `bg-brand-600`. Lihat SERIES_COLORS. */
  color: string;
}

export interface Bar {
  key: string;
  label: string;
  total: number;
  /** seriesId -> nilai. Kosong = satu seri. */
  parts?: Record<string, number>;
}

/** Urutan warna seri: brand tua/muda bergantian supaya batang bertumpuk terbaca. */
export const SERIES_COLORS = ["bg-brand-600", "bg-brand-300", "bg-brand-800", "bg-brand-200", "bg-brand-400", "bg-zinc-300"] as const;

export function BarChart({
  bars,
  series,
  format,
  ariaLabel,
}: {
  bars: readonly Bar[];
  series?: readonly BarSeries[];
  format: (value: number) => string;
  ariaLabel: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.total));
  const peak = bars.reduce<Bar | null>((best, b) => (b.total > (best?.total ?? 0) ? b : best), null);
  const shown = bars.find((b) => b.key === selected) ?? peak;
  const stacked = (series?.length ?? 0) > 1;
  const labelEvery = Math.max(1, Math.ceil(bars.length / 7));

  return (
    <div>
      <p className="mb-3 min-h-6 text-sm text-zinc-500" aria-live="polite">
        {shown ? (
          <>
            {selected ? shown.label : `Tertinggi ${shown.label}`} ·{" "}
            <span className="font-bold text-zinc-900 tabular-nums">{format(shown.total)}</span>
          </>
        ) : null}
      </p>
      <div role="group" aria-label={ariaLabel} className="flex h-40 items-end gap-0.5 border-b border-zinc-200">
        {bars.map((bar) => (
          <button
            key={bar.key}
            type="button"
            aria-label={`${bar.label}: ${format(bar.total)}`}
            aria-pressed={selected === bar.key}
            onClick={() => setSelected((s) => (s === bar.key ? null : bar.key))}
            className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-none"
          >
            <span
              className={cn(
                "flex w-full flex-col-reverse overflow-hidden rounded-t-md transition duration-200 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/40",
                selected && selected !== bar.key && "opacity-50",
              )}
              style={{ height: bar.total > 0 ? `max(2px, ${(bar.total / max) * 100}%)` : 0 }}
            >
              {stacked ? (
                series!.map((s, i) => {
                  const value = bar.parts?.[s.id] ?? 0;
                  return value > 0 ? <span key={s.id} className={s.color ?? SERIES_COLORS[i]} style={{ flexGrow: value }} /> : null;
                })
              ) : (
                <span className={cn("flex-1", series?.[0]?.color ?? "bg-brand-500")} />
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5" aria-hidden>
        {bars.map((bar, i) => (
          <span key={bar.key} className="relative h-4 min-w-0 flex-1">
            {i % labelEvery === 0 && (
              <span
                className={cn(
                  "absolute whitespace-nowrap text-xs text-zinc-500 tabular-nums",
                  i === 0 ? "left-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {bar.label}
              </span>
            )}
          </span>
        ))}
      </div>
      {stacked && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {series!.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-sm text-zinc-600">
              <span className={cn("h-3 w-3 rounded-sm", s.color)} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
