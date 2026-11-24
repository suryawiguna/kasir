import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "../components/Drawer";
import { SelectMenu } from "../components/SelectMenu";
import { Confirm, Field, RowChevron, SegmentedControl, Toggle } from "../components/ui";
import type { ChoiceGroup, Consume, Product, StockItem, StockMode, Unit } from "../domain/types";
import { deleteProduct, makeId, saveProduct } from "../features/catalog/catalogActions";
import { formatRupiah, parseRupiahInput } from "../features/pricing/money";
import { useShop } from "../features/shop/ShopContext";
import { ownStockItemId } from "../features/stock/consumption";
import { findUnit, formatQuantity, formatUnitNumber, parseQuantityInput } from "../features/units/units";

/**
 * Daftar dan editor produk. Pemilik memilih sendiri cara hitung stok per
 * produk (stok sendiri / pakai stok bersama / tidak dilacak) dan isi paket
 * (tetap lewat stok bersama, atau dipilih saat jual lewat grup pilihan).
 * Mengganti pilihan ini aman kapan saja: pesanan lama menyimpan snapshot.
 */
export function ProductsSection() {
  const { products, categories, config, branches } = useShop();
  const [editing, setEditing] = useState<{ product: Product; isNew: boolean } | null>(null);
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name;

  const blank = (): Product => ({
    id: makeId("products"),
    name: "",
    price: 0,
    unit: config.units.find((u) => !u.hidden)?.code ?? "pcs",
    soldBy: "count",
    stockMode: "shared",
    consumes: [],
    active: true,
    order: products.length,
  });

  return (
    <div className="space-y-2">
      <button className="btn-secondary w-full" onClick={() => setEditing({ product: blank(), isNew: true })}>
        <Plus size={16} /> Tambah produk
      </button>
      {products.length === 0 ? (
        <p className="card p-6 text-center text-sm text-zinc-500">Belum ada produk.</p>
      ) : (
        <ul className="card divide-y divide-zinc-100 overflow-hidden">
          {products.map((p) => (
            <li key={p.id}>
              <button
                className="row-tap flex items-center gap-3"
                onClick={() => setEditing({ product: p, isNew: false })}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-zinc-900">
                    {p.name}
                    {!p.active && <span className="pill ml-2 bg-zinc-100 text-zinc-500">Nonaktif</span>}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {[
                      p.sku,
                      categoryName(p.categoryId),
                      `${formatRupiah(p.price)}/${findUnit(config.units, p.unit).label}`,
                      STOCK_MODE_SHORT[p.stockMode],
                      p.choiceGroups?.length ? `${p.choiceGroups.length} grup pilihan` : null,
                      p.branchIds?.length && branches.length > 1
                        ? `hanya ${p.branchIds.map((id) => branches.find((b) => b.id === id)?.code ?? id).join(", ")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <RowChevron />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ProductEditor initial={editing.product} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
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
  const freeCandidates = useMemo(() => products.filter((p) => p.id !== draft.id), [products, draft.id]);

  const save = () => {
    setError("");
    const price = parseRupiahInput(priceText);
    if (!draft.name.trim()) return setError("Nama produk wajib diisi.");
    if (price === null) return setError("Harga wajib diisi.");

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
    };
    saveProduct(product, shared, stockItems, config.units);
    toast.success(`${product.name} disimpan`);
    onClose();
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
      open
      size="lg"
      onClose={onClose}
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
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama">
            <input className="field-input" autoFocus={isNew} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Ayam Segar 40K" />
          </Field>
          <Field label="SKU (opsional)">
            <input className="field-input" value={draft.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
          </Field>
          <Field group label="Kategori">
            <SelectMenu
              label="Kategori"
              value={draft.categoryId ?? ""}
              onChange={(v) => set("categoryId", v || undefined)}
              options={[{ value: "", label: "Tanpa kategori" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
          <Field group label="Satuan jual">
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

        {showBundles && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="section-title">Pilihan saat jual</h3>
              <button className="btn-ghost btn-sm" onClick={() => setGroups((g) => [...g, newGroup()])}>
                <Plus size={14} /> Grup pilihan
              </button>
            </div>
            <p className="field-hint -mt-2">
              Untuk paket yang isinya dipilih saat jual (mis. "Pilih 3 ayam"), varian rasa, atau level pedas.
            </p>
            {groups.map((g, gi) => (
              <GroupEditor
                key={g.id}
                group={g}
                onChange={(next) => setGroups((all) => all.map((x, i) => (i === gi ? next : x)))}
                onRemove={() => setGroups((all) => all.filter((_, i) => i !== gi))}
              />
            ))}
          </section>
        )}

        {freeCandidates.length > 0 && (
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
            <p className="field-hint">Per 1 {unit.label} terjual. Stok bonus ikut terpotong dan tercatat di pesanan.</p>
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
                  <input
                    className="field-input w-36 text-right tabular-nums"
                    inputMode="numeric"
                    placeholder={priceText ? `${formatRupiah(parseRupiahInput(priceText) ?? 0)}` : "Harga"}
                    value={branchPrices[b.id] ?? ""}
                    disabled={!sold}
                    onChange={(e) => setBranchPrices((p) => ({ ...p, [b.id]: e.target.value }))}
                  />
                </div>
              );
            })}
            <p className="field-hint">Kosongkan harga cabang untuk memakai harga dasar.</p>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Urutan di kasir">
            <input className="field-input" type="number" value={draft.order} onChange={(e) => set("order", Number(e.target.value) || 0)} />
          </Field>
          <div className="pt-5">
            <Toggle label="Aktif (tampil di kasir)" checked={draft.active} onChange={(v) => set("active", v)} />
          </div>
        </section>

        {!isNew && (
          <p className="field-hint">
            Mengubah harga, mode stok, atau isi paket berlaku untuk penjualan berikutnya. Pesanan lama tidak berubah.
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
          onClose();
        }}
      />
    </Drawer>
  );
}

function GroupEditor({
  group,
  onChange,
  onRemove,
}: {
  group: GroupDraft;
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
        <input className="field-input flex-1" placeholder="Nama grup, mis. Pilih 3 ayam" value={group.label} onChange={(e) => onChange({ ...group, label: e.target.value })} />
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
              <input className="field-input flex-1" placeholder="Nama opsi, mis. Ukuran 40K" value={o.label} onChange={(e) => setOption(i, { label: e.target.value })} />
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
            <ConsumeRows rows={o.rows} onChange={(rows) => setOption(i, { rows })} perLabel="kali dipilih" addLabel="Potong item stok" />
            {o.rows.length > 0 && o.rows.every((r) => r.stockItemId) && (
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
        <button className="btn-ghost btn-sm" onClick={fillFromStock}>
          <Plus size={14} /> Satu opsi per item stok
        </button>
      </div>
    </div>
  );
}
