import { ArrowUpDown, Check, ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { Drawer, TRANSITION_MS } from "../components/Drawer";
import { ImagePicker } from "../components/ImagePicker";
import { ProductImage } from "../components/ProductImage";
import { SelectMenu } from "../components/SelectMenu";
import { Confirm, Field, RowChevron, SegmentedControl, Toggle } from "../components/ui";
import type { ChoiceGroup, Consume, Product, StockItem, StockMode, Unit } from "../domain/types";
import { deleteProduct, makeId, saveProduct, saveProductOrder } from "../features/catalog/catalogActions";
import { moveId, reorderWithin } from "../features/catalog/reorder";
import { isProductImageKeyFor } from "../features/media/imageKeys";
import { uploadsEnabled } from "../features/media/uploadImage";
import { formatRupiah, parseRupiahInput } from "../features/pricing/money";
import { useShop } from "../features/shop/ShopContext";
import { cn } from "../lib/cn";
import { ownStockItemId } from "../features/stock/consumption";
import { findUnit, formatQuantity, formatUnitNumber, parseQuantityInput } from "../features/units/units";

/**
 * Daftar dan editor produk. Pemilik memilih sendiri cara hitung stok per
 * produk (stok sendiri / pakai stok bersama / tidak dilacak) dan isi paket
 * (tetap lewat stok bersama, atau dipilih saat jual lewat grup pilihan).
 * Mengganti pilihan ini aman kapan saja: pesanan lama menyimpan snapshot.
 */
export function ProductsSection() {
  const { products, categories, config, branches, features } = useShop();
  const [editing, setEditing] = useState<{ product: Product; isNew: boolean } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [category, setCategory] = useState("all");
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name;

  const usedCategories = categories.filter((c) => products.some((p) => p.categoryId === c.id));
  const filterOptions = [
    { value: "all", label: "Semua" },
    ...usedCategories.map((c) => ({ value: c.id, label: c.name })),
    ...(products.some((p) => !p.categoryId) && usedCategories.length ? [{ value: "", label: "Tanpa kategori" }] : []),
  ];
  const shown = category === "all" ? products : products.filter((p) => (p.categoryId ?? "") === category);

  const blank = (): Product => ({
    id: makeId("products"),
    name: "",
    price: 0,
    unit: config.units.find((u) => !u.hidden)?.code ?? "pcs",
    soldBy: "count",
    stockMode: features.stockTracking ? "shared" : "none",
    consumes: [],
    // Produk baru masuk di akhir kategorinya (atau di akhir daftar).
    categoryId: category !== "all" && category ? category : undefined,
    active: true,
    order: products.reduce((max, p) => Math.max(max, p.order + 1), 0),
  });

  /** Urutan baru untuk produk yang tampil, diterapkan ke daftar penuh. */
  const applyOrder = (subsetIds: string[]) =>
    saveProductOrder(
      products,
      reorderWithin(
        products.map((p) => p.id),
        subsetIds,
      ),
    );

  const meta = (p: Product) =>
    [
      features.sku || p.sku ? p.sku : null,
      categoryName(p.categoryId),
      `${formatRupiah(p.price)}/${findUnit(config.units, p.unit).label}`,
      features.stockTracking ? STOCK_MODE_SHORT[p.stockMode] : null,
      p.choiceGroups?.length ? `${p.choiceGroups.length} grup pilihan` : null,
      p.branchIds?.length && branches.length > 1
        ? `hanya ${p.branchIds.map((id) => branches.find((b) => b.id === id)?.code ?? id).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {!sorting && (
          <button className="btn-secondary flex-1" onClick={() => setEditing({ product: blank(), isNew: true })}>
            <Plus size={16} /> Tambah produk
          </button>
        )}
        {products.length > 1 && (
          <button
            className={sorting ? "btn-primary flex-1" : "btn-secondary"}
            onClick={() => setSorting((v) => !v)}
            aria-pressed={sorting}
          >
            {sorting ? (
              <>
                <Check size={16} /> Selesai
              </>
            ) : (
              <>
                <ArrowUpDown size={16} /> Atur urutan
              </>
            )}
          </button>
        )}
      </div>
      {filterOptions.length > 2 && (
        <SegmentedControl scrollable value={category} onChange={setCategory} options={filterOptions} />
      )}
      {sorting && (
        <p className="field-hint">
          Geser pegangan atau pakai tombol panah. Urutan ini yang tampil di kasir, langsung tersimpan.
        </p>
      )}
      {shown.length === 0 ? (
        <p className="card p-6 text-center text-sm text-zinc-500">Belum ada produk.</p>
      ) : sorting ? (
        <SortableProducts products={shown} meta={meta} onReorder={applyOrder} />
      ) : (
        <ul className="card divide-y divide-zinc-100 overflow-hidden">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                className="row-tap flex items-center gap-3"
                onClick={() => setEditing({ product: p, isNew: false })}
              >
                <ProductImage imageKey={p.image} name={p.name} className="h-10 w-10 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-zinc-900">
                    {p.name}
                    {!p.active && <span className="pill ml-2 bg-zinc-100 text-zinc-500">Nonaktif</span>}
                  </p>
                  <p className="text-sm text-zinc-500">{meta(p)}</p>
                </div>
                <RowChevron />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ProductEditor key={editing.product.id} initial={editing.product} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Atur urutan: geser pegangan atau tombol panah                       */
/* ------------------------------------------------------------------ */

/**
 * Daftar yang bisa diurutkan. Selama digeser, urutan sementara disimpan di
 * state lokal supaya baris lain langsung bergeser; dilepas = satu write.
 * Pointer events (bukan drag-and-drop HTML) supaya jalan di layar sentuh.
 */
function SortableProducts({
  products,
  meta,
  onReorder,
}: {
  products: Product[];
  meta: (p: Product) => string;
  onReorder: (ids: string[]) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const byId = new Map(products.map((p) => [p.id, p]));
  const saved = products.map((p) => p.id);
  const ids = (preview ?? saved).filter((id) => byId.has(id));
  // Pointer events bisa datang lebih cepat dari render: handler membaca ref, bukan state.
  const drag = useRef<{ id: string; ids: string[] } | null>(null);

  // Urutan sementara dilepas begitu snapshot membawa urutan yang baru disimpan.
  const savedKey = saved.join("|");
  useEffect(() => {
    if (!dragId) setPreview(null);
  }, [savedKey, dragId]);

  const commit = (next: string[]) => {
    if (next.join("|") === savedKey) {
      setPreview(null);
      return;
    }
    setPreview(next);
    onReorder(next);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const current = drag.current;
    if (!current || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLElement>("[data-sort-id]")];
    // Posisi baru = jumlah baris lain yang titik tengahnya di atas jari.
    const to = rows.filter((row) => {
      if (row.dataset.sortId === current.id) return false;
      const box = row.getBoundingClientRect();
      return box.top + box.height / 2 < e.clientY;
    }).length;
    const next = moveId(current.ids, current.id, to);
    if (next.join("|") !== current.ids.join("|")) {
      current.ids = next;
      setPreview(next);
    }
  };

  const endDrag = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragId(null);
    commit(current.ids);
  };

  return (
    <ul ref={listRef} className="card divide-y divide-zinc-100 overflow-hidden">
      {ids.map((id, i) => {
        const p = byId.get(id)!;
        const dragging = dragId === id;
        return (
          <li
            key={id}
            data-sort-id={id}
            className={cn("flex items-center gap-2 py-2 pl-1 pr-2 bg-white transition-colors", dragging && "bg-brand-50 relative z-10 shadow-md")}
          >
            <button
              type="button"
              className="btn-ghost h-11 w-9 shrink-0 cursor-grab touch-none px-0 active:cursor-grabbing"
              aria-label={`Geser ${p.name}`}
              onPointerDown={(e) => {
                e.preventDefault();
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Pointer sudah lepas; geser tetap jalan selama jari di atas pegangan.
                }
                drag.current = { id, ids };
                setDragId(id);
                setPreview(ids);
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <GripVertical size={18} />
            </button>
            <span className="w-6 shrink-0 text-right text-sm tabular-nums text-zinc-400">{i + 1}</span>
            <ProductImage imageKey={p.image} name={p.name} className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-zinc-900">
                {p.name}
                {!p.active && <span className="pill ml-2 bg-zinc-100 text-zinc-500">Nonaktif</span>}
              </p>
              <p className="truncate text-sm text-zinc-500">{meta(p)}</p>
            </div>
            <button
              type="button"
              className="btn-ghost h-9 w-9 shrink-0 px-0"
              aria-label={`Naikkan ${p.name}`}
              disabled={i === 0}
              onClick={() => commit(moveId(ids, id, i - 1))}
            >
              <ChevronUp size={18} />
            </button>
            <button
              type="button"
              className="btn-ghost h-9 w-9 shrink-0 px-0"
              aria-label={`Turunkan ${p.name}`}
              disabled={i === ids.length - 1}
              onClick={() => commit(moveId(ids, id, i + 1))}
            >
              <ChevronDown size={18} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const STOCK_MODE_SHORT: Record<StockMode, string> = {
  own: "stok sendiri",
  shared: "stok bersama",
  none: "tidak dilacak",
};

/* ------------------------------------------------------------------ */
/* Baris konsumsi yang bisa diedit (jumlah sebagai teks)               */
/* ------------------------------------------------------------------ */

interface ConsumeRow {
  stockItemId: string;
  qtyText: string;
}

const toRows = (consumes: readonly Consume[] | undefined, stockItems: readonly StockItem[], units: readonly Unit[]): ConsumeRow[] =>
  (consumes ?? []).map((c) => {
    const item = stockItems.find((s) => s.id === c.stockItemId);
    return { stockItemId: c.stockItemId, qtyText: formatUnitNumber(c.qty, findUnit(units, item?.unit ?? "")) };
  });

/** Baris ke consumes, atau pesan galat. */
const fromRows = (
  rows: readonly ConsumeRow[],
  stockItems: readonly StockItem[],
  units: readonly Unit[],
): { ok: true; consumes: Consume[] } | { ok: false; message: string } => {
  const consumes: Consume[] = [];
  for (const row of rows) {
    if (!row.stockItemId) continue;
    const item = stockItems.find((s) => s.id === row.stockItemId);
    const qty = parseQuantityInput(row.qtyText, findUnit(units, item?.unit ?? ""));
    if (!qty) return { ok: false, message: `Jumlah untuk ${item?.name ?? row.stockItemId} tidak valid.` };
    consumes.push({ stockItemId: row.stockItemId, qty });
  }
  return { ok: true, consumes };
};

function ConsumeRows({
  rows,
  onChange,
  perLabel,
  addLabel = "Tambah item stok",
}: {
  rows: ConsumeRow[];
  onChange: (rows: ConsumeRow[]) => void;
  perLabel: string;
  addLabel?: string;
}) {
  const { stockItems, config } = useShop();
  const choosable = stockItems.filter((s) => s.active || rows.some((r) => r.stockItemId === s.id));
  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const item = stockItems.find((s) => s.id === row.stockItemId);
        const unit = findUnit(config.units, item?.unit ?? "");
        return (
          <div key={i} className="flex items-center gap-2">
            <SelectMenu
              className="flex-1 min-w-0"
              label="Item stok"
              placeholder="Pilih item stok"
              value={row.stockItemId}
              onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, stockItemId: v } : r)))}
              options={choosable.map((s) => ({ value: s.id, label: s.name, hint: findUnit(config.units, s.unit).label }))}
            />
            <input
              className="field-input w-20 text-right tabular-nums"
              inputMode="decimal"
              value={row.qtyText}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, qtyText: e.target.value } : r)))}
            />
            <span className="w-12 text-xs text-zinc-500">{item ? unit.label : ""}</span>
            <button className="btn-ghost h-9 w-9 px-0" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Hapus baris">
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      <button className="btn-ghost btn-sm" onClick={() => onChange([...rows, { stockItemId: "", qtyText: "1" }])}>
        <Plus size={14} /> {addLabel}
      </button>
      <p className="field-hint">Jumlah yang terpotong per {perLabel}.</p>
      {choosable.length === 0 && <p className="field-hint text-amber-700">Belum ada item stok. Buat dulu di Pengaturan → Item stok.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

interface GroupDraft extends Omit<ChoiceGroup, "options"> {
  options: { id: string; label: string; priceText: string; rows: ConsumeRow[]; active: boolean }[];
}

function ProductEditor({ initial, isNew, onClose }: { initial: Product; isNew: boolean; onClose: () => void }) {
  const { config, categories, stockItems, products, branches, features } = useShop();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<Product>(initial);
  const [priceText, setPriceText] = useState(initial.price ? String(initial.price) : "");
  const [rows, setRows] = useState<ConsumeRow[]>(() =>
    initial.stockMode === "shared" ? toRows(initial.consumes, stockItems, config.units) : [],
  );
  const [groups, setGroups] = useState<GroupDraft[]>(() =>
    (initial.choiceGroups ?? []).map((g) => ({
      ...g,
      options: g.options.map((o) => ({
        id: o.id,
        label: o.label,
        priceText: o.priceDelta ? String(o.priceDelta) : "",
        rows: toRows(o.consumes, stockItems, config.units),
        active: o.active !== false,
      })),
    })),
  );
  const [branchPrices, setBranchPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial.priceByBranch ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const unit = findUnit(config.units, draft.unit);
  const perLabel = draft.soldBy === "weight" ? `1 ${unit.label}` : `1 ${unit.label} terjual`;
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const ownItem = stockItems.find((s) => s.id === ownStockItemId(draft.id));
  const showBundles = features.bundles || groups.length > 0;
  // Bagian form mengikuti Pengaturan → Fitur; data yang sudah terisi tetap tampil supaya tidak hilang diam-diam.
  const trackStock = features.stockTracking;
  const showSku = features.sku || Boolean(initial.sku);
  const showBonus = features.freeItems || Boolean(initial.freeItems?.length);
  const showBranchPrices = features.branchPricing || Object.keys(initial.priceByBranch ?? {}).length > 0;
  const freeCandidates = useMemo(() => products.filter((p) => p.id !== draft.id), [products, draft.id]);
  // Item "stok sendiri" menyimpan jumlah dalam satuan dasar satuan jual. Satuan
  // dengan faktor lain (pcs → kg) akan membaca stok yang ada dengan skala salah.
  const ownUnit = ownItem ? findUnit(config.units, ownItem.unit) : null;
  const ownUnitClash = features.stockTracking && draft.stockMode === "own" && ownUnit !== null && ownUnit.factor !== unit.factor;

  /** Tutup dengan animasi, lalu lepas editor (pola yang sama dengan editor lain). */
  const close = () => {
    setOpen(false);
    setTimeout(onClose, TRANSITION_MS);
  };

  const save = () => {
    setError("");
    const price = parseRupiahInput(priceText);
    if (!draft.name.trim()) return setError("Nama produk wajib diisi.");
    if (price === null) return setError("Harga wajib diisi.");
    if (ownUnitClash) {
      return setError(
        `Stok sendiri produk ini tercatat dalam ${ownUnit.label}. Pilih satuan jual dengan faktor yang sama, atau pakai stok bersama.`,
      );
    }

    let shared: Consume[] = [];
    if (draft.stockMode === "shared") {
      const parsed = fromRows(rows, stockItems, config.units);
      if (!parsed.ok) return setError(parsed.message);
      shared = parsed.consumes;
    }

    const choiceGroups: ChoiceGroup[] = [];
    for (const g of groups) {
      if (!g.label.trim()) return setError("Setiap grup pilihan butuh nama.");
      if (g.min < 0 || g.max < 1 || g.min > g.max) return setError(`${g.label}: min/max tidak valid.`);
      if (g.options.length === 0) return setError(`${g.label}: tambahkan minimal satu opsi.`);
      const options = [];
      for (const o of g.options) {
        if (!o.label.trim()) return setError(`${g.label}: setiap opsi butuh nama.`);
        const parsed = fromRows(o.rows, stockItems, config.units);
        if (!parsed.ok) return setError(`${g.label} · ${o.label}: ${parsed.message}`);
        const delta = parseRupiahInput(o.priceText);
        options.push({
          id: o.id,
          label: o.label.trim(),
          ...(delta ? { priceDelta: delta } : {}),
          ...(parsed.consumes.length ? { consumes: parsed.consumes } : {}),
          ...(o.active ? {} : { active: false }),
        });
      }
      choiceGroups.push({ id: g.id, label: g.label.trim(), min: g.min, max: g.max, allowRepeat: g.allowRepeat, options });
    }

    const priceByBranch: Record<string, number> = {};
    for (const [id, text] of Object.entries(branchPrices)) {
      const v = parseRupiahInput(text);
      if (v !== null && branches.some((b) => b.id === id)) priceByBranch[id] = v;
    }

    const product: Product = {
      ...draft,
      name: draft.name.trim(),
      sku: draft.sku?.trim() || undefined,
      categoryId: draft.categoryId || undefined,
      price,
      choiceGroups: choiceGroups.length ? choiceGroups : undefined,
      freeItems: draft.freeItems?.filter((f) => f.productId && f.qty > 0).length
        ? draft.freeItems.filter((f) => f.productId && f.qty > 0)
        : undefined,
      branchIds: draft.branchIds?.length ? draft.branchIds : undefined,
      priceByBranch: Object.keys(priceByBranch).length ? priceByBranch : undefined,
      // URL lama (sebelum unggah ada) ditolak rules; dibuang supaya produk tetap bisa disimpan.
      image: draft.image && isProductImageKeyFor(draft.image, draft.id) ? draft.image : undefined,
    };
    saveProduct(product, shared, stockItems, config.units);
    toast.success(`${product.name} disimpan`);
    close();
  };

  const newGroup = (): GroupDraft => ({
    id: makeId("products"),
    label: "",
    min: 1,
    max: 1,
    allowRepeat: false,
    options: [],
  });

  return (
    <Drawer
      open={open}
      size="lg"
      onClose={close}
      title={isNew ? "Produk baru" : draft.name || "Produk"}
      footer={
        <div className="space-y-2">
          {error && <p role="alert" className="card card-danger p-3 text-sm font-medium text-red-700">{error}</p>}
          <div className="flex gap-2">
            {!isNew && (
              <button className="btn-danger-quiet" onClick={() => setConfirmDelete(true)}>
                Hapus
              </button>
            )}
            <button className="btn-primary flex-1" onClick={save}>
              Simpan
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {uploadsEnabled() && (
          <Field group label="Foto" hint="Dipotong persegi di daftar kasir. Perubahan berlaku setelah Simpan.">
            <ImagePicker
              target={{ kind: "product", productId: draft.id }}
              value={draft.image}
              name={draft.name}
              onChange={(key) => set("image", key)}
            />
          </Field>
        )}
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama">
            <input className="field-input" data-autofocus={isNew || undefined} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Produk A" />
          </Field>
          {showSku && (
            <Field label="SKU (opsional)">
              <input className="field-input" value={draft.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
            </Field>
          )}
          <Field group label="Kategori">
            <SelectMenu
              label="Kategori"
              value={draft.categoryId ?? ""}
              onChange={(v) => set("categoryId", v || undefined)}
              options={[{ value: "", label: "Tanpa kategori" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
          <Field
            group
            label="Satuan jual"
            error={ownUnitClash ? `Stok sendiri tercatat dalam ${ownUnit.label}; satuan ini memakai faktor lain.` : undefined}
          >
            <SelectMenu
              label="Satuan jual"
              value={draft.unit}
              onChange={(v) => set("unit", v)}
              options={config.units.filter((u) => !u.hidden || u.code === draft.unit).map((u) => ({ value: u.code, label: u.label }))}
            />
          </Field>
          {(features.weightSales || draft.soldBy === "weight") && (
            <Field group label="Dijual" hint={draft.soldBy === "weight" ? "Kasir mengetik berat; harga di bawah per satuan." : undefined}>
              <SegmentedControl
                className="w-full"
                value={draft.soldBy}
                onChange={(v) => set("soldBy", v)}
                options={[
                  { value: "count", label: "Per jumlah" },
                  { value: "weight", label: "Per berat/takaran" },
                ]}
              />
            </Field>
          )}
          <Field label={`Harga per ${unit.label}`}>
            <input className="field-input tabular-nums" inputMode="numeric" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="40000" />
          </Field>
        </section>

        {trackStock && (
          <section className="space-y-3">
            <h3 className="section-title">Cara hitung stok</h3>
            <SegmentedControl
              className="w-full"
              value={draft.stockMode}
              onChange={(v) => set("stockMode", v)}
              options={[
                { value: "own", label: "Stok sendiri" },
                { value: "shared", label: "Pakai stok bersama" },
                { value: "none", label: "Tidak dilacak" },
              ]}
            />
            {draft.stockMode === "own" && (
              <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">
                Produk ini punya item stok sendiri ({ownItem ? `"${ownItem.name}"` : "dibuat saat disimpan"}), dalam {unit.label}.
                Isi jumlahnya di tab Stok.
              </p>
            )}
            {draft.stockMode === "shared" && <ConsumeRows rows={rows} onChange={setRows} perLabel={perLabel} />}
            {draft.stockMode === "none" && (
              <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">
                Produk ini tidak memotong stok.{groups.length ? " Opsi pilihan di bawah tetap memotong stok sesuai isinya." : ""}
              </p>
            )}
          </section>
        )}

        {showBundles && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="section-title">Pilihan saat jual</h3>
              <button className="btn-ghost btn-sm" onClick={() => setGroups((g) => [...g, newGroup()])}>
                <Plus size={14} /> Grup pilihan
              </button>
            </div>
            <p className="field-hint -mt-2">
              Untuk paket yang isinya dipilih saat jual (mis. "Pilih 3 produk"), varian, ukuran, atau tingkat pedas.
            </p>
            {groups.map((g, gi) => (
              <GroupEditor
                key={g.id}
                group={g}
                trackStock={trackStock}
                onChange={(next) => setGroups((all) => all.map((x, i) => (i === gi ? next : x)))}
                onRemove={() => setGroups((all) => all.filter((_, i) => i !== gi))}
              />
            ))}
          </section>
        )}

        {showBonus && freeCandidates.length > 0 && (
          <section className="space-y-2">
            <h3 className="section-title">Bonus gratis</h3>
            {(draft.freeItems ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <SelectMenu
                  className="flex-1 min-w-0"
                  label="Produk bonus"
                  placeholder="Pilih produk"
                  value={f.productId}
                  onChange={(v) => set("freeItems", draft.freeItems!.map((x, j) => (j === i ? { ...x, productId: v } : x)))}
                  options={freeCandidates.map((p) => ({ value: p.id, label: p.name }))}
                />
                <input
                  className="field-input w-20 text-right"
                  type="number"
                  min={1}
                  value={f.qty}
                  onChange={(e) => set("freeItems", draft.freeItems!.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))}
                />
                <button className="btn-ghost h-9 w-9 px-0" onClick={() => set("freeItems", draft.freeItems!.filter((_, j) => j !== i))} aria-label="Hapus bonus">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => set("freeItems", [...(draft.freeItems ?? []), { productId: "", qty: 1 }])}>
              <Plus size={14} /> Tambah bonus
            </button>
            <p className="field-hint">
              Per 1 {unit.label} terjual. {trackStock ? "Stok bonus ikut terpotong dan tercatat di pesanan." : "Tercatat di pesanan."}
              {!features.freeItems && " Bonus gratis sedang dimatikan di Pengaturan → Fitur, jadi tidak berlaku di kasir."}
            </p>
          </section>
        )}

        {branches.length > 1 && (
          <section className="space-y-2">
            <h3 className="section-title">Cabang</h3>
            {branches.map((b) => {
              const sold = !draft.branchIds?.length || draft.branchIds.includes(b.id);
              return (
                <div key={b.id} className="flex items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={sold}
                      onChange={(e) => {
                        const all = branches.map((x) => x.id);
                        const current = draft.branchIds?.length ? draft.branchIds : all;
                        const next = e.target.checked ? [...new Set([...current, b.id])] : current.filter((id) => id !== b.id);
                        set("branchIds", next.length === all.length ? undefined : next);
                      }}
                    />
                    {b.name}
                  </label>
                  {showBranchPrices && (
                    <input
                      className="field-input w-36 text-right tabular-nums"
                      inputMode="numeric"
                      placeholder={priceText ? `${formatRupiah(parseRupiahInput(priceText) ?? 0)}` : "Harga"}
                      value={branchPrices[b.id] ?? ""}
                      disabled={!sold}
                      onChange={(e) => setBranchPrices((p) => ({ ...p, [b.id]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
            <p className="field-hint">
              {showBranchPrices ? "Centang cabang yang menjual produk ini. Kosongkan harga cabang untuk memakai harga dasar." : "Centang cabang yang menjual produk ini."}
              {showBranchPrices && !features.branchPricing && " Harga per cabang sedang dimatikan di Pengaturan → Fitur, jadi semua cabang memakai harga dasar."}
            </p>
          </section>
        )}

        <Toggle
          label="Aktif (tampil di kasir)"
          detail="Urutan di kasir diatur dari daftar produk → Atur urutan."
          checked={draft.active}
          onChange={(v) => set("active", v)}
        />

        {!isNew && (
          <p className="field-hint">
            Mengubah harga{trackStock ? ", mode stok," : ""} atau isi paket berlaku untuk penjualan berikutnya. Pesanan lama tidak berubah.
          </p>
        )}
      </div>

      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus produk?"
        message="Pesanan lama tetap utuh (nama dan harga tersimpan di pesanan). Untuk menyembunyikan sementara, nonaktifkan saja."
        confirmLabel="Hapus produk"
        tone="danger"
        onConfirm={() => {
          deleteProduct(initial);
          close();
        }}
      />
    </Drawer>
  );
}

function GroupEditor({
  group,
  trackStock,
  onChange,
  onRemove,
}: {
  group: GroupDraft;
  trackStock: boolean;
  onChange: (g: GroupDraft) => void;
  onRemove: () => void;
}) {
  const { stockItems, config } = useShop();
  const setOption = (i: number, patch: Partial<GroupDraft["options"][number]>) =>
    onChange({ ...group, options: group.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  /** Satu opsi per item stok yang dipilih, memotong 1 satuan. Cepat untuk "pilih ukuran". */
  const fillFromStock = () => {
    const existing = new Set(group.options.flatMap((o) => o.rows.map((r) => r.stockItemId)));
    const added = stockItems
      .filter((s) => s.active && !existing.has(s.id))
      .map((s) => ({
        id: makeId("products"),
        label: s.name,
        priceText: "",
        rows: [{ stockItemId: s.id, qtyText: formatUnitNumber(findUnit(config.units, s.unit).factor, findUnit(config.units, s.unit)) }],
        active: true,
      }));
    onChange({ ...group, options: [...group.options, ...added] });
  };

  return (
    <div className="space-y-3 card p-3">
      <div className="flex items-center gap-2">
        <input className="field-input flex-1" placeholder="Nama grup, mis. Pilih varian" value={group.label} onChange={(e) => onChange({ ...group, label: e.target.value })} />
        <button className="btn-ghost h-9 w-9 px-0" onClick={onRemove} aria-label="Hapus grup">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Minimal">
          <input className="field-input" type="number" min={0} value={group.min} onChange={(e) => onChange({ ...group, min: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <Field label="Maksimal">
          <input className="field-input" type="number" min={1} value={group.max} onChange={(e) => onChange({ ...group, max: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
        <div className="col-span-2 pt-5 sm:col-span-1">
          <Toggle label="Boleh berulang" checked={group.allowRepeat} onChange={(v) => onChange({ ...group, allowRepeat: v })} />
        </div>
      </div>
      <p className="field-hint">
        {group.min === group.max ? `Kasir memilih tepat ${group.min}` : `Kasir memilih ${group.min}–${group.max}`}
        {group.allowRepeat ? ", opsi yang sama boleh dipilih lebih dari sekali." : "."}
      </p>
      <ul className="space-y-3">
        {group.options.map((o, i) => (
          <li key={o.id} className="space-y-2 rounded-xl bg-zinc-50 p-3">
            <div className="flex items-center gap-2">
              <input className="field-input flex-1" placeholder="Nama opsi, mis. Varian A" value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} />
              <input
                className="field-input w-28 text-right tabular-nums"
                inputMode="numeric"
                placeholder="+Rp0"
                value={o.priceText}
                onChange={(e) => setOption(i, { priceText: e.target.value })}
              />
              <button
                className="btn-ghost h-9 w-9 px-0"
                onClick={() => onChange({ ...group, options: group.options.filter((_, j) => j !== i) })}
                aria-label="Hapus opsi"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {trackStock && (
              <ConsumeRows rows={o.rows} onChange={(rows) => setOption(i, { rows })} perLabel="kali dipilih" addLabel="Potong item stok" />
            )}
            {trackStock && o.rows.length > 0 && o.rows.every((r) => r.stockItemId) && (
              <p className="text-xs text-zinc-500">
                {o.rows
                  .map((r) => {
                    const s = stockItems.find((x) => x.id === r.stockItemId);
                    const u = findUnit(config.units, s?.unit ?? "");
                    const q = parseQuantityInput(r.qtyText, u);
                    return q ? `${s?.name} ${formatQuantity(q, u)}` : null;
                  })
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost btn-sm"
          onClick={() =>
            onChange({ ...group, options: [...group.options, { id: makeId("products"), label: "", priceText: "", rows: [], active: true }] })
          }
        >
          <Plus size={14} /> Opsi
        </button>
        {trackStock && (
          <button className="btn-ghost btn-sm" onClick={fillFromStock}>
            <Plus size={14} /> Satu opsi per item stok
          </button>
        )}
      </div>
    </div>
  );
}
