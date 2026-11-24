import clsx from "clsx";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Drawer, Field, Segmented, Toggle } from "../components/ui";
import type { Branch, Category, ShopConfig, StockItem, Timezone, Unit } from "../domain/types";
import { TIMEZONE_LABELS } from "../lib/businessDate";
import { useAuth } from "../features/auth/AuthContext";
import { deleteCategory, makeId, saveBranch, saveCategory, saveFeatures, saveShopConfig, saveStockItem, slugId } from "../features/catalog/catalogActions";
import { useDevice } from "../features/device/DeviceContext";
import { BRANCH_CODE_PATTERN } from "../features/orders/orderNumber";
import { FEATURE_INFO, FEATURE_ORDER } from "../features/settings/featureFlags";
import { useShop } from "../features/shop/ShopContext";
import { findUnit, parseQuantityInput, formatUnitNumber, unitCodeFromLabel, validateUnit } from "../features/units/units";
import { ProductsSection } from "./ProductsSection";

type Section = "toko" | "produk" | "stok" | "kategori" | "satuan" | "cabang" | "fitur" | "perangkat";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "produk", label: "Produk" },
  { id: "stok", label: "Item stok" },
  { id: "kategori", label: "Kategori" },
  { id: "satuan", label: "Satuan" },
  { id: "cabang", label: "Cabang" },
  { id: "toko", label: "Toko dan struk" },
  { id: "fitur", label: "Fitur" },
  { id: "perangkat", label: "Perangkat ini" },
];

/** Pengaturan pemilik. Semua pilihan bisnis ada di sini, bukan di kode. */
export default function SettingsPage() {
  const [section, setSection] = useState<Section>("produk");
  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={clsx(
              "h-9 shrink-0 rounded-full px-4 text-sm font-semibold",
              section === s.id ? "bg-brand-600 text-brand-fg" : "border border-zinc-200 bg-white text-zinc-700",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "toko" && <ShopSection />}
      {section === "produk" && <ProductsSection />}
      {section === "stok" && <StockItemsSection />}
      {section === "kategori" && <CategoriesSection />}
      {section === "satuan" && <UnitsSection />}
      {section === "cabang" && <BranchesSection />}
      {section === "fitur" && <FeaturesSection />}
      {section === "perangkat" && <DeviceSection />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ShopSection() {
  const { config } = useShop();
  const { user } = useAuth();
  const [draft, setDraft] = useState<ShopConfig>(config);
  const set = <K extends keyof ShopConfig>(key: K, value: ShopConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const lines = (text: string) => text.split("\n").map((l) => l.trimEnd()).filter((l, i, all) => l || i < all.length - 1).slice(0, 8);

  return (
    <div className="card space-y-4 p-4">
      <Field label="Nama toko">
        <input className="field" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Warna brand">
        <div className="flex items-center gap-2">
          <input type="color" className="h-11 w-14 rounded-xl border border-zinc-200" value={draft.brandColor} onChange={(e) => set("brandColor", e.target.value)} />
          <input className="field" value={draft.brandColor} onChange={(e) => set("brandColor", e.target.value)} />
        </div>
      </Field>
      <Field label="URL logo (opsional)" hint="Unggah logo lewat aplikasi menyusul (Fase 6).">
        <input className="field" value={draft.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value || undefined)} />
      </Field>
      <Field label="Zona waktu">
        <select className="field" value={draft.timezone} onChange={(e) => set("timezone", e.target.value as Timezone)}>
          {(Object.keys(TIMEZONE_LABELS) as Timezone[]).map((tz) => (
            <option key={tz} value={tz}>
              {TIMEZONE_LABELS[tz]} ({tz})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Stok habis" hint="Blokir: kasir tidak bisa menjual melebihi stok. Peringatan: boleh, dengan tanda.">
        <Segmented
          value={draft.stockPolicy}
          onChange={(v) => set("stockPolicy", v)}
          options={[
            { value: "block", label: "Blokir" },
            { value: "warn", label: "Peringatan saja" },
          ]}
        />
      </Field>
      <Field label="Pesanan langsung" hint="Pilih Diproses bila barang perlu disiapkan dulu (mis. dipotong) sebelum diserahkan.">
        <Segmented
          value={draft.instantStatus}
          onChange={(v) => set("instantStatus", v)}
          options={[
            { value: "completed", label: "Langsung selesai" },
            { value: "pending", label: "Diproses dulu" },
          ]}
        />
      </Field>
      <Field label="Header struk" hint="Satu baris per baris. Alamat per cabang diatur di Cabang.">
        <textarea className="field h-24 py-2" value={draft.receipt.header.join("\n")} onChange={(e) => set("receipt", { ...draft.receipt, header: lines(e.target.value) })} />
      </Field>
      <Field label="Footer struk">
        <textarea className="field h-20 py-2" value={draft.receipt.footer.join("\n")} onChange={(e) => set("receipt", { ...draft.receipt, footer: lines(e.target.value) })} />
      </Field>
      <Toggle
        label="Nama pelanggan di struk"
        checked={draft.receipt.showCustomerName}
        onChange={(v) => set("receipt", { ...draft.receipt, showCustomerName: v })}
      />
      <button
        className="btn-primary w-full"
        disabled={!draft.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(draft.brandColor)}
        onClick={() => {
          saveShopConfig({ ...draft, name: draft.name.trim() }, user?.email ?? "");
          toast.success("Pengaturan toko disimpan");
        }}
      >
        Simpan
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FeaturesSection() {
  const { features } = useShop();
  const { user } = useAuth();
  return (
    <div className="card divide-y divide-zinc-100 px-4">
      {FEATURE_ORDER.map((name) => {
        const info = FEATURE_INFO[name];
        return (
          <Toggle
            key={name}
            label={info.ready ? info.label : `${info.label} (segera)`}
            detail={info.detail}
            checked={features[name]}
            disabled={!info.ready}
            onChange={(value) => saveFeatures({ ...features, [name]: value }, user?.email ?? "")}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ListCard<T extends { id: string }>({
  items,
  render,
  onOpen,
  onAdd,
  addLabel,
  empty,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  onOpen: (item: T) => void;
  onAdd: () => void;
  addLabel: string;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <button className="btn-secondary w-full" onClick={onAdd}>
        <Plus size={16} /> {addLabel}
      </button>
      {items.length === 0 ? (
        <p className="card p-6 text-center text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="card divide-y divide-zinc-100">
          {items.map((item) => (
            <li key={item.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50" onClick={() => onOpen(item)}>
                <div className="min-w-0 flex-1">{render(item)}</div>
                <ChevronRight size={16} className="text-zinc-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoriesSection() {
  const { categories, products } = useShop();
  const [editing, setEditing] = useState<{ item: Category; isNew: boolean } | null>(null);
  return (
    <>
      <ListCard
        items={categories}
        addLabel="Tambah kategori"
        empty="Belum ada kategori."
        onAdd={() => setEditing({ item: { id: "", name: "", order: categories.length, active: true }, isNew: true })}
        onOpen={(item) => setEditing({ item, isNew: false })}
        render={(c) => (
          <>
            <p className="font-medium">{c.name}</p>
            <p className="text-xs text-zinc-500">
              {products.filter((p) => p.categoryId === c.id).length} produk{c.active ? "" : " · disembunyikan"}
            </p>
          </>
        )}
      />
      {editing && (
        <CategoryEditor
          initial={editing.item}
          isNew={editing.isNew}
          inUse={products.some((p) => p.categoryId === editing.item.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CategoryEditor({ initial, isNew, inUse, onClose }: { initial: Category; isNew: boolean; inUse: boolean; onClose: () => void }) {
  const { categories } = useShop();
  const [draft, setDraft] = useState(initial);
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? "Kategori baru" : draft.name}
      footer={
        <div className="flex gap-2">
          {!isNew && !inUse && (
            <button className="btn-ghost text-red-600" onClick={() => { deleteCategory(initial); onClose(); }}>
              Hapus
            </button>
          )}
          <button
            className="btn-primary flex-1"
            disabled={!draft.name.trim()}
            onClick={() => {
              let id = draft.id;
              if (isNew) {
                id = slugId(draft.name);
                if (categories.some((c) => c.id === id)) id = makeId("categories");
              }
              saveCategory({ ...draft, id, name: draft.name.trim() });
              onClose();
            }}
          >
            Simpan
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Nama">
          <input className="field" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Urutan">
          <input className="field" type="number" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) || 0 })} />
        </Field>
        <Toggle label="Tampil di kasir" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
        {inUse && <p className="hint">Kategori yang masih dipakai produk tidak bisa dihapus, hanya disembunyikan.</p>}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function StockItemsSection() {
  const { stockItems, config } = useShop();
  const [editing, setEditing] = useState<{ item: StockItem; isNew: boolean } | null>(null);
  return (
    <>
      <p className="text-sm text-zinc-600">
        Item stok adalah barang yang dihitung di rak/freezer. Produk memotong satu atau beberapa item stok saat terjual.
      </p>
      <ListCard
        items={stockItems}
        addLabel="Tambah item stok"
        empty="Belum ada item stok."
        onAdd={() =>
          setEditing({
            item: { id: "", name: "", unit: config.units.find((u) => !u.hidden)?.code ?? "pcs", active: true, order: stockItems.length },
            isNew: true,
          })
        }
        onOpen={(item) => setEditing({ item, isNew: false })}
        render={(s) => (
          <>
            <p className="font-medium">{s.name}</p>
            <p className="text-xs text-zinc-500">
              {findUnit(config.units, s.unit).label}
              {s.ownerProductId ? " · stok sendiri produk" : ""}
              {s.active ? "" : " · nonaktif"}
            </p>
          </>
        )}
      />
      {editing && <StockItemEditor initial={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

function StockItemEditor({ initial, isNew, onClose }: { initial: StockItem; isNew: boolean; onClose: () => void }) {
  const { config, stockItems } = useShop();
  const [draft, setDraft] = useState(initial);
  const unit = findUnit(config.units, draft.unit);
  const [lowText, setLowText] = useState(initial.lowAt !== undefined ? formatUnitNumber(initial.lowAt, unit) : "");
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? "Item stok baru" : draft.name}
      footer={
        <button
          className="btn-primary w-full"
          disabled={!draft.name.trim()}
          onClick={() => {
            let id = draft.id;
            if (isNew) {
              id = slugId(draft.name);
              if (stockItems.some((s) => s.id === id)) id = makeId("stockItems");
            }
            const lowAt = lowText.trim() === "0" ? 0 : parseQuantityInput(lowText, unit);
            const item: StockItem = { ...draft, id, name: draft.name.trim() };
            if (lowAt === null) delete item.lowAt;
            else item.lowAt = lowAt;
            saveStockItem(item);
            onClose();
          }}
        >
          Simpan
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="Nama">
          <input className="field" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ayam utuh" />
        </Field>
        <Field label="Satuan" hint={isNew ? undefined : "Satuan tidak bisa diganti setelah dibuat (stok tersimpan dalam satuan ini)."}>
          <select className="field" value={draft.unit} disabled={!isNew} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
            {config.units.filter((u) => !u.hidden || u.code === draft.unit).map((u) => (
              <option key={u.code} value={u.code}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Tanda menipis di bawah (${unit.label})`} hint="Kosongkan bila tidak perlu.">
          <input className="field" inputMode="decimal" value={lowText} onChange={(e) => setLowText(e.target.value)} />
        </Field>
        <Toggle label="Aktif" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
        <p className="hint">Item stok tidak dihapus karena pesanan lama mencatatnya. Nonaktifkan bila tidak dipakai.</p>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function UnitsSection() {
  const { config, products, stockItems } = useShop();
  const { user } = useAuth();
  const [editing, setEditing] = useState<{ unit: Unit; isNew: boolean } | null>(null);
  const inUse = (code: string) => products.some((p) => p.unit === code) || stockItems.some((s) => s.unit === code);
  const save = (units: Unit[]) => saveShopConfig({ ...config, units }, user?.email ?? "");
  return (
    <>
      <ListCard
        items={config.units.map((u) => ({ ...u, id: u.code }))}
        addLabel="Tambah satuan"
        empty="Belum ada satuan."
        onAdd={() => setEditing({ unit: { code: "", label: "", factor: 1, decimals: 0, step: 1 }, isNew: true })}
        onOpen={(u) => setEditing({ unit: u, isNew: false })}
        render={(u) => (
          <>
            <p className="font-medium">{u.label}</p>
            <p className="text-xs text-zinc-500">
              {u.factor > 1 ? `disimpan dalam ${u.baseLabel ?? "satuan dasar"} (×${u.factor}) · ` : ""}
              {u.decimals > 0 ? `${u.decimals} desimal` : "bilangan bulat"}
              {u.hidden ? " · disembunyikan" : ""}
              {inUse(u.code) ? " · dipakai" : ""}
            </p>
          </>
        )}
      />
      {editing && (
        <UnitEditor
          initial={editing.unit}
          isNew={editing.isNew}
          used={inUse(editing.unit.code)}
          others={config.units.filter((u) => u.code !== editing.unit.code)}
          onSave={(unit) => {
            save(editing.isNew ? [...config.units, unit] : config.units.map((u) => (u.code === unit.code ? unit : u)));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function UnitEditor({
  initial,
  isNew,
  used,
  others,
  onSave,
  onClose,
}: {
  initial: Unit;
  isNew: boolean;
  used: boolean;
  others: Unit[];
  onSave: (unit: Unit) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Unit>(initial);
  const [stepText, setStepText] = useState(String(initial.step).replace(".", ","));
  const unit: Unit = {
    ...draft,
    code: isNew ? unitCodeFromLabel(draft.label) : draft.code,
    step: Number(stepText.replace(",", ".")) || 0,
  };
  const problem = validateUnit(unit, others);
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? "Satuan baru" : draft.label}
      footer={
        <button className="btn-primary w-full" disabled={Boolean(problem)} onClick={() => onSave(unit)}>
          Simpan
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="Nama satuan">
          <input className="field" autoFocus value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="ikat" />
        </Field>
        <Field
          label="Faktor satuan dasar"
          hint={used ? "Tidak bisa diganti: produk/stok sudah tersimpan dengan faktor ini." : "1 untuk satuan hitungan. 1000 untuk kg (disimpan gram) atau liter (disimpan ml)."}
        >
          <input
            className="field"
            type="number"
            min={1}
            disabled={used}
            value={draft.factor}
            onChange={(e) => setDraft({ ...draft, factor: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
          />
        </Field>
        {draft.factor > 1 && (
          <Field label="Nama satuan dasar">
            <input className="field" value={draft.baseLabel ?? ""} onChange={(e) => setDraft({ ...draft, baseLabel: e.target.value || undefined })} placeholder="gram" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desimal">
            <input className="field" type="number" min={0} max={3} value={draft.decimals} onChange={(e) => setDraft({ ...draft, decimals: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Langkah +/-">
            <input className="field" inputMode="decimal" value={stepText} onChange={(e) => setStepText(e.target.value)} />
          </Field>
        </div>
        <Toggle label="Sembunyikan dari pilihan baru" checked={Boolean(draft.hidden)} onChange={(v) => setDraft({ ...draft, hidden: v || undefined })} />
        {problem && <p className="text-sm text-red-600">{problem}</p>}
        <p className="hint">Satuan tidak pernah dihapus karena pesanan lama menyimpannya. Sembunyikan bila tidak dipakai.</p>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function BranchesSection() {
  const { branches } = useShop();
  const [editing, setEditing] = useState<{ branch: Branch; isNew: boolean } | null>(null);
  return (
    <>
      <ListCard
        items={branches}
        addLabel="Tambah cabang"
        empty="Belum ada cabang."
        onAdd={() => setEditing({ branch: { id: "", name: "", code: "", active: true, order: branches.length }, isNew: true })}
        onOpen={(branch) => setEditing({ branch, isNew: false })}
        render={(b) => (
          <>
            <p className="font-medium">{b.name}</p>
            <p className="text-xs text-zinc-500">
              {b.code}
              {b.active ? "" : " · diarsip"}
            </p>
          </>
        )}
      />
      {editing && <BranchEditor initial={editing.branch} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

function BranchEditor({ initial, isNew, onClose }: { initial: Branch; isNew: boolean; onClose: () => void }) {
  const { branches } = useShop();
  const { user } = useAuth();
  const [draft, setDraft] = useState(initial);
  const codeTaken = isNew && branches.some((b) => b.code === draft.code);
  const valid = draft.name.trim() && BRANCH_CODE_PATTERN.test(draft.code) && !codeTaken;
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? "Cabang baru" : draft.name}
      footer={
        <button
          className="btn-primary w-full"
          disabled={!valid}
          onClick={() => {
            let id = draft.id;
            if (isNew) {
              id = slugId(draft.name);
              if (branches.some((b) => b.id === id)) id = draft.code.toLowerCase();
            }
            saveBranch({ ...draft, id, name: draft.name.trim() }, isNew, user?.email ?? "");
            onClose();
          }}
        >
          Simpan
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="Nama cabang">
          <input className="field" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Kode" hint={isNew ? "2–6 huruf besar/angka, masuk ke nomor pesanan. Tidak bisa diganti setelah dibuat." : "Kode tidak bisa diganti."}>
          <input
            className="field uppercase"
            disabled={!isNew}
            maxLength={6}
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
          />
        </Field>
        {codeTaken && <p className="text-sm text-red-600">Kode ini sudah dipakai cabang lain.</p>}
        <Field label="Header struk cabang (opsional)" hint="Menimpa header toko, mis. alamat cabang. Satu baris per baris.">
          <textarea
            className="field h-20 py-2"
            value={(draft.receiptHeader ?? []).join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n").slice(0, 8);
              setDraft({ ...draft, receiptHeader: lines.some((l) => l.trim()) ? lines : undefined });
            }}
          />
        </Field>
        <Toggle label="Aktif" detail="Cabang diarsip tidak bisa dipilih perangkat baru." checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function DeviceSection() {
  const { setup, clear } = useDevice();
  const { branches } = useShop();
  const branch = branches.find((b) => b.id === setup?.branchId);
  return (
    <div className="card space-y-3 p-4">
      <p className="text-sm">
        Cabang: <span className="font-semibold">{branch?.name}</span> · Huruf perangkat:{" "}
        <span className="font-semibold">{setup?.deviceLetter}</span>
      </p>
      <p className="hint">
        Mengganti setup tidak mengubah pesanan lama. Pastikan huruf baru tidak dipakai perangkat lain yang masih aktif.
      </p>
      <button className="btn-secondary" onClick={clear}>
        Ganti setup perangkat
      </button>
    </div>
  );
}
