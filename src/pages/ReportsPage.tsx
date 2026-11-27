import { AlertCircle, BarChart3, CheckCircle2, Download, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BarChart, SERIES_COLORS, type BarSeries } from "../components/BarChart";
import { SelectMenu } from "../components/SelectMenu";
import { Empty, SegmentedControl, Skeleton } from "../components/ui";
import { STORAGE_SLUG } from "../features/demo/demo";
import { buildReportCsv } from "../features/export/csv";
import { PAYMENT_METHOD_LABEL } from "../features/orders/buildOrder";
import { formatRupiah } from "../features/pricing/money";
import { salesByBranch } from "../features/reports/byBranch";
import { percentChange, previousScope } from "../features/reports/compare";
import { lowStock } from "../features/reports/lowStock";
import { paymentBreakdown } from "../features/reports/payments";
import { RANGE_OPTIONS, reportPeriod, type RangePreset } from "../features/reports/period";
import { summarize } from "../features/reports/summary";
import { productSales, type ProductSort } from "../features/reports/topProducts";
import { salesTrend } from "../features/reports/trend";
import { useBranchLevels } from "../features/reports/useBranchLevels";
import { useReportOrders } from "../features/reports/useReportOrders";
import { useShop } from "../features/shop/ShopContext";
import { findUnit, formatQuantity } from "../features/units/units";
import { getBusinessDate } from "../lib/businessDate";
import { cn } from "../lib/cn";

/**
 * Laporan pemilik: ringkasan, per cabang, tren, produk terlaris, metode bayar,
 * stok menipis, Ekspor. Semua angka dari features/reports/ (murni, dites);
 * halaman ini hanya memilih rentang/cabang dan menggambar.
 */
export default function ReportsPage() {
  const { config } = useShop();
  const [now, setNow] = useState(() => new Date());
  // Jam berjalan supaya "Hari ini" ikut penjualan yang baru masuk.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const todayStart = reportPeriod("today", config.timezone, now).from;
  // Ganti hari = jendela baru (listener hari ini pindah ke tanggal baru).
  return <Report key={todayStart} now={now} todayStart={todayStart} />;
}

function Report({ now, todayStart }: { now: Date; todayStart: string }) {
  const { config, features, branches, stockItems } = useShop();
  const [preset, setPreset] = useState<RangePreset>("today");
  const [branchChoice, setBranchChoice] = useState("all");
  const [sort, setSort] = useState<ProductSort>("sales");

  const tz = config.timezone;
  const period = useMemo(() => reportPeriod(preset, tz, now), [preset, tz, now]);
  const { orders, ready, failed, truncated, retry } = useReportOrders(todayStart, period.prevFrom);
  const levels = useBranchLevels(branches, features.stockTracking);

  const activeBranches = branches.filter((b) => b.active);
  const multi = branches.length > 1;
  const branchId = multi && branchChoice !== "all" ? branchChoice : undefined;
  const scope = useMemo(() => ({ from: period.from, to: period.to, branchId }), [period.from, period.to, branchId]);
  const byBranchView = multi && !branchId && activeBranches.length > 1;

  const summary = useMemo(() => summarize(orders, scope), [orders, scope]);
  const before = useMemo(() => summarize(orders, previousScope(period, branchId)), [orders, period, branchId]);
  const branchRows = useMemo(() => (byBranchView ? salesByBranch(orders, scope, branches) : []), [orders, scope, byBranchView, branches]);
  const trend = useMemo(() => salesTrend(orders, scope, period, tz), [orders, scope, period, tz]);
  const products = useMemo(() => productSales(orders, scope, config.units, sort).slice(0, 10), [orders, scope, config.units, sort]);
  const payments = useMemo(
    () => paymentBreakdown(orders, scope, { cash: true, transfer: features.transfer, qris: features.qris }),
    [orders, scope, features.transfer, features.qris],
  );
  const low = useMemo(() => lowStock(stockItems, levels, branches, branchId), [stockItems, levels, branches, branchId]);

  const series: BarSeries[] = byBranchView
    ? activeBranches.map((b, i) => ({ id: b.id, label: b.name, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    : [{ id: "all", label: "Penjualan", color: "bg-brand-500" }];
  const colorOf = (id: string) => series.find((s) => s.id === id)?.color ?? "bg-zinc-300";
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const empty = summary.transactions === 0 && summary.owedCount === 0;

  const exportCsv = () => {
    const csv = buildReportCsv(orders, scope, { branches, units: config.units, timezone: tz });
    const first = period.dates[0];
    const last = getBusinessDate(tz, new Date(new Date(period.to).getTime() - 1));
    const where = branchId ? `-${branches.find((b) => b.id === branchId)?.code.toLowerCase() ?? branchId}` : "";
    const name = `laporan-${STORAGE_SLUG.replace(/[^a-z0-9-]+/gi, "-")}${where}-${first}${last !== first ? `_${last}` : ""}.csv`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${name} diunduh`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SegmentedControl scrollable className="lg:flex-1" value={preset} onChange={setPreset} options={RANGE_OPTIONS} />
        {multi && (
          <SelectMenu
            className="lg:w-56"
            label="Cabang"
            value={branchChoice}
            onChange={setBranchChoice}
            options={[{ value: "all", label: "Semua cabang" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          />
        )}
      </div>

      {failed ? (
        <div className="card card-danger card-pad flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-red-700">
            <AlertCircle size={18} /> Laporan gagal dimuat. Periksa koneksi.
          </span>
          <button className="btn-secondary btn-sm" onClick={retry}>
            Coba lagi
          </button>
        </div>
      ) : !ready ? (
        <div className="space-y-2" aria-busy="true">
          <p className="text-sm text-zinc-500">Memuat pesanan…</p>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          {truncated && (
            <p className="card card-warn card-pad text-sm text-amber-800">
              Pesanan di rentang ini terlalu banyak untuk dimuat sekaligus. Angka mungkin kurang; pilih rentang yang lebih pendek.
            </p>
          )}

          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Ringkasan">
            <StatCard wide label="Penjualan" value={formatRupiah(summary.sales)} change={percentChange(summary.sales, before.sales)} compare={period.compareLabel} />
            <StatCard
              label="Transaksi"
              value={String(summary.transactions)}
              change={percentChange(summary.transactions, before.transactions)}
              compare={period.compareLabel}
            />
            <StatCard
              label="Rata-rata per transaksi"
              value={formatRupiah(summary.average)}
              change={percentChange(summary.average, before.average)}
              compare={period.compareLabel}
            />
            {features.preorder && (
              <StatCard
                label="Belum dibayar"
                value={formatRupiah(summary.owed)}
                detail={`${summary.owedCount} pesanan`}
                change={percentChange(summary.owed, before.owed)}
                compare={period.compareLabel}
                warn={summary.owedCount > 0}
                wide
              />
            )}
          </section>

          {empty ? (
            <Empty icon={<BarChart3 size={40} />} title="Belum ada penjualan di rentang ini" />
          ) : (
            <>
              {byBranchView && (
                <Section title="Per cabang">
                  <ul className="space-y-3">
                    {branchRows.map((r) => (
                      <li key={r.branchId}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 font-bold text-zinc-900">
                            <span className={cn("h-3 w-3 shrink-0 rounded-sm", colorOf(r.branchId))} />
                            <span className="truncate">{r.name}</span>
                          </span>
                          <span className="text-base font-bold tabular-nums">{formatRupiah(r.sales)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                            <span className={cn("block h-full rounded-full", colorOf(r.branchId))} style={{ width: `${r.share}%` }} />
                          </span>
                          <span className="w-36 shrink-0 text-right text-sm text-zinc-500 tabular-nums">
                            {r.transactions} transaksi · {r.share}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {trend.length > 0 && (
                <Section title={period.granularity === "day" ? "Penjualan per hari" : "Penjualan per jam"}>
                  <BarChart
                    key={`${preset}-${branchId ?? "all"}`}
                    ariaLabel={period.granularity === "day" ? "Penjualan per hari" : "Penjualan per jam"}
                    bars={trend.map((b) => ({ key: b.key, label: b.label, total: b.total, parts: b.byBranch }))}
                    series={series}
                    format={formatRupiah}
                  />
                </Section>
              )}

              {products.length > 0 && (
                <Section
                  title="Produk terlaris"
                  action={
                    <button className="btn-ghost btn-sm" onClick={() => setSort((s) => (s === "sales" ? "quantity" : "sales"))}>
                      {sort === "sales" ? "Urut jumlah" : "Urut rupiah"}
                    </button>
                  }
                >
                  <ol className="divide-y divide-zinc-100">
                    {products.map((p, i) => (
                      <li key={`${p.productId}|${p.unit.code}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="w-5 shrink-0 text-sm font-bold text-zinc-400 tabular-nums">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-zinc-900">{p.name}</span>
                          <span className="block text-sm text-zinc-500 tabular-nums">{formatQuantity(p.quantity, p.unit)}</span>
                        </span>
                        <span className="font-bold tabular-nums">{formatRupiah(p.sales)}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              <Section title="Metode bayar">
                <ul className="space-y-3">
                  {payments.map((p) => (
                    <li key={p.method}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-bold text-zinc-900">{PAYMENT_METHOD_LABEL[p.method]}</span>
                        <span className="font-bold tabular-nums">{formatRupiah(p.total)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                          <span
                            className="block h-full rounded-full bg-brand-500"
                            style={{ width: summary.sales > 0 ? `${(p.total / summary.sales) * 100}%` : 0 }}
                          />
                        </span>
                        <span className="w-24 shrink-0 text-right text-sm text-zinc-500 tabular-nums">{p.count} transaksi</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          )}

          {features.stockTracking && stockItems.some((s) => s.active) && (
            <Section title="Stok menipis">
              {low.length === 0 ? (
                <p className="flex items-center gap-2 text-sm font-bold text-zinc-600">
                  <CheckCircle2 size={18} className="text-brand-700" /> Semua stok aman
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {low.map((r) => (
                    <li key={`${r.branchId}|${r.item.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-zinc-900">{r.item.name}</span>
                        {multi && <span className="block text-sm text-zinc-500">{branchName(r.branchId)}</span>}
                      </span>
                      <span className="font-bold tabular-nums">{formatQuantity(Math.max(r.level, 0), findUnit(config.units, r.item.unit))}</span>
                      <span className={cn("pill", r.state === "low" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700")}>
                        {r.state === "low" ? "Menipis" : "Habis"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {!empty && (
            <button className="btn-secondary w-full lg:w-auto" onClick={exportCsv}>
              <Download size={18} /> Ekspor CSV
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  change,
  compare,
  warn,
  wide,
}: {
  label: string;
  value: string;
  detail?: string;
  change: number | null;
  compare: string;
  warn?: boolean;
  /** Dua kolom di HP: angka utama dan angka yang bisa panjang. */
  wide?: boolean;
}) {
  return (
    <div className={cn("card card-pad-tight min-w-0", warn && "card-warn", wide && "col-span-2 lg:col-span-1")}>
      <p className={cn("text-sm font-medium", warn ? "text-amber-800" : "text-zinc-500")}>{label}</p>
      <p className={cn("mt-1 truncate font-bold text-zinc-900 tabular-nums", value.length > 10 && !wide ? "text-lg lg:text-xl" : "text-xl lg:text-2xl")}>{value}</p>
      {detail && <p className="text-sm text-zinc-500 tabular-nums">{detail}</p>}
      {change !== null && (
        <p className="mt-1 flex items-start gap-1 text-xs font-medium text-zinc-500 tabular-nums">
          {change >= 0 ? <TrendingUp size={14} className="mt-px shrink-0" /> : <TrendingDown size={14} className="mt-px shrink-0" />}
          <span>
            {change > 0 ? "+" : ""}
            {change}% {compare}
          </span>
        </p>
      )}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card card-pad">
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <h2 className="font-bold text-zinc-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
