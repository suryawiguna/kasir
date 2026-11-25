import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Drawer } from "../components/Drawer";
import { ImagePicker } from "../components/ImagePicker";
import { SelectMenu } from "../components/SelectMenu";
import { Confirm, Field, RowChevron, SegmentedControl, Toggle } from "../components/ui";
import type { Branch, Category, ShopConfig, StockItem, Timezone, Unit } from "../domain/types";
import { useAuth } from "../features/auth/AuthContext";
import { deleteCategory, makeId, saveBranch, saveCategory, saveFeatures, saveShopConfig, saveStockItem, slugId } from "../features/catalog/catalogActions";
import { useDevice } from "../features/device/DeviceContext";
import { BRANCH_CODE_PATTERN } from "../features/orders/orderNumber";
import { FEATURE_INFO, FEATURE_ORDER } from "../features/settings/featureFlags";
import { useShop } from "../features/shop/ShopContext";
import { findUnit, formatUnitNumber, parseQuantityInput, unitCodeFromLabel, validateUnit } from "../features/units/units";
import { TIMEZONE_LABELS } from "../lib/businessDate";
import { cn } from "../lib/cn";
import { ProductsSection } from "./ProductsSection";

type Section = "produk" | "stok" | "kategori" | "satuan" | "cabang" | "toko" | "fitur" | "perangkat";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "produk", label: "Produk" },
  { value: "stok", label: "Item stok" },
  { value: "kategori", label: "Kategori" },
  { value: "satuan", label: "Satuan" },
  { value: "cabang", label: "Cabang" },
  { value: "toko", label: "Toko dan struk" },
  { value: "fitur", label: "Fitur" },
  { value: "perangkat", label: "Perangkat" },
];

/** Pengaturan pemilik. Semua pilihan bisnis ada di sini, bukan di kode. */
export default function SettingsPage() {
  const [section, setSection] = useState<Section>("produk");
  return (
    <div className="space-y-4">
      <div className="sticky -top-4 z-20 -mx-4 bg-zinc-50/95 px-4 pt-4 pb-2 backdrop-blur lg:-top-4">
        <SegmentedControl scrollable value={section} onChange={setSection} options={SECTIONS} />
      </div>
      <div className="max-w-2xl">
        {section === "toko" && <ShopSection />}
        {section === "produk" && <ProductsSection />}
        {section === "stok" && <StockItemsSection />}
        {section === "kategori" && <CategoriesSection />}
        {section === "satuan" && <UnitsSection />}
        {section === "cabang" && <BranchesSection />}
        {section === "fitur" && <FeaturesSection />}
        {section === "perangkat" && <DeviceSection />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bantuan tata letak                                                  */
/* ------------------------------------------------------------------ */

export function SectionIntro({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm text-zinc-500">{children}</p>;
}

/** Daftar rekaman: satu kartu, baris dibagi garis, satu ketukan membuka editor. */
export function RecordList<T extends { id: string }>({
  items,
  render,
  onOpen,
  onAdd,
  addLabel,
  empty,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  onOpen: (item: T) => void;
  onAdd: () => void;
  addLabel: string;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <button className="btn-secondary w-full" onClick={onAdd}>
        <Plus size={18} /> {addLabel}
      </button>
      {items.length === 0 ? (
        <p className="card p-6 text-center text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="card divide-y divide-zinc-100 overflow-hidden">
          {items.map((item) => (
            <li key={item.id}>
              <button className="row-tap flex items-center gap-3" onClick={() => onOpen(item)}>
                <div className="min-w-0 flex-1">{render(item)}</div>
                <RowChevron />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const RowTitle = ({ children }: { children: ReactNode }) => <p className="font-bold text-zinc-900">{children}</p>;
export const RowMeta = ({ children }: { children: ReactNode }) => <p className="text-sm text-zinc-500">{children}</p>;

/** Footer editor: hapus (opsional) di kiri, simpan memenuhi sisanya. */
function EditorFooter({ onSave, disabled, onDelete }: { onSave: () => void; disabled?: boolean; onDelete?: () => void }) {
  return (
    <div className="flex gap-2">
      {onDelete && (
        <button className="btn-danger-quiet" onClick={onDelete}>
          Hapus
        </button>
      )}
      <button className="btn-primary flex-1" disabled={disabled} onClick={onSave}>
        Simpan
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toko dan struk                                                      */
/* ------------------------------------------------------------------ */

function ShopSection() {
  const { config } = useShop();
  const { user } = useAuth();
  const [draft, setDraft] = useState<ShopConfig>(config);
  const set = <K extends keyof ShopConfig>(key: K, value: ShopConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const lines = (text: string) => text.split("\n").slice(0, 8);
  const validColor = /^#[0-9a-fA-F]{6}$/.test(draft.brandColor);

  return (
    <div className="space-y-4">
      <div className="card card-pad space-y-4">
        <h2 className="section-title">Identitas</h2>
        <Field label="Nama toko">
          <input className="field-input" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Warna brand" hint="Tombol utama, tab aktif, dan aksen mengikuti warna ini." error={validColor ? undefined : "Format #RRGGBB"}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pilih warna"
              className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-zinc-200 bg-white p-1"
              value={validColor ? draft.brandColor : "#000000"}
              onChange={(e) => set("brandColor", e.target.value)}
            />
            <input className="field-input font-mono" value={draft.brandColor} onChange={(e) => set("brandColor", e.target.value)} />
          </div>
        </Field>
        <Field group label="Logo" hint="Tampil di layar masuk dan menu. Perubahan berlaku setelah Simpan.">
          <ImagePicker
            target={{ kind: "logo" }}
            value={draft.logo ?? undefined}
            name={draft.name}
            // Logo unggahan menggantikan URL lama sepenuhnya.
            onChange={(key) => setDraft((d) => ({ ...d, logo: key, logoUrl: undefined }))}
          />
        </Field>
      </div>

      <div className="card card-pad space-y-4">
        <h2 className="section-title">Cara kerja toko</h2>
        <Field group label="Zona waktu" hint="Menentukan tanggal di laporan dan nomor pesanan.">
          <SelectMenu
            label="Zona waktu"
            value={draft.timezone}
            onChange={(v) => set("timezone", v)}
            options={(Object.keys(TIMEZONE_LABELS) as Timezone[]).map((tz) => ({ value: tz, label: `${TIMEZONE_LABELS[tz]} (${tz})` }))}
          />
        </Field>
        <Field group label="Saat stok habis" hint="Blokir: kasir tidak bisa menjual melebihi stok. Peringatan: boleh, dengan tanda.">
          <SegmentedControl
            className="w-full"
            value={draft.stockPolicy}
            onChange={(v) => set("stockPolicy", v)}
            options={[
              { value: "block", label: "Blokir" },
              { value: "warn", label: "Peringatan saja" },
            ]}
          />
        </Field>
        <Field group label="Pesanan langsung" hint="Pilih Diproses dulu bila barang perlu disiapkan (mis. dimasak atau dikemas) sebelum diserahkan.">
          <SegmentedControl
            className="w-full"
            value={draft.instantStatus}
            onChange={(v) => set("instantStatus", v)}
            options={[
              { value: "completed", label: "Langsung selesai" },
              { value: "pending", label: "Diproses dulu" },
            ]}
          />
        </Field>
      </div>

      <div className="card card-pad space-y-4">
        <h2 className="section-title">Struk</h2>
        <Field label="Header" hint="Satu baris per baris. Alamat per cabang diatur di Cabang.">
          <textarea
            className="field-input"
            rows={3}
            value={draft.receipt.header.join("\n")}
            onChange={(e) => set("receipt", { ...draft.receipt, header: lines(e.target.value) })}
          />
        </Field>
        <Field label="Footer">
          <textarea
            className="field-input"
            rows={2}
            value={draft.receipt.footer.join("\n")}
            onChange={(e) => set("receipt", { ...draft.receipt, footer: lines(e.target.value) })}
          />
        </Field>
        <Field group label="Lebar kertas" hint="Lihat ukuran gulungan di printer thermal.">
          <SegmentedControl
            className="w-full"
            value={String(draft.receipt.paperWidth) as "32" | "48"}
            onChange={(v) => set("receipt", { ...draft.receipt, paperWidth: v === "48" ? 48 : 32 })}
            options={[
              { value: "32", label: "58 mm" },
              { value: "48", label: "80 mm" },
            ]}
          />
        </Field>
        <Toggle
          label="Nama pelanggan di struk"
          checked={draft.receipt.showCustomerName}
          onChange={(v) => set("receipt", { ...draft.receipt, showCustomerName: v })}
        />
      </div>

      <button
        className="btn-primary w-full"
        disabled={!draft.name.trim() || !validColor}
        onClick={() => {
          const clean = (l: string[]) => l.map((x) => x.trimEnd()).filter(Boolean);
          saveShopConfig(
            { ...draft, name: draft.name.trim(), receipt: { ...draft.receipt, header: clean(draft.receipt.header), footer: clean(draft.receipt.footer) } },
            user?.email ?? "",
          );
          toast.success("Pengaturan toko disimpan");
        }}
      >
        Simpan
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fitur                                                               */
/* ------------------------------------------------------------------ */

function FeaturesSection() {
  const { features } = useShop();
  const { user } = useAuth();
  return (
    <>
      <SectionIntro>Mematikan fitur menyembunyikannya dari semua perangkat. Data yang sudah tercatat tidak dihapus.</SectionIntro>
      <div className="card divide-y divide-zinc-100 px-4">
        {FEATURE_ORDER.filter((name) => FEATURE_INFO[name].ready).map((name) => {
          const info = FEATURE_INFO[name];
          return (
            <Toggle
              key={name}
              label={info.label}
              detail={info.detail}
              checked={features[name]}
              onChange={(value) => saveFeatures({ ...features, [name]: value }, user?.email ?? "")}
            />
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Kategori                                                            */
/* ------------------------------------------------------------------ */

function CategoriesSection() {
  const { categories, products } = useShop();
  const [editing, setEditing] = useState<{ item: Category; isNew: boolean } | null>(null);
  return (
    <>
      <SectionIntro>Kategori mengelompokkan produk di Kasir.</SectionIntro>
      <RecordList
        items={categories}
        addLabel="Tambah kategori"
        empty="Belum ada kategori."
        onAdd={() => setEditing({ item: { id: "", name: "", order: categories.length, active: true }, isNew: true })}
        onOpen={(item) => setEditing({ item, isNew: false })}
        render={(c) => (
          <>
            <RowTitle>{c.name}</RowTitle>
            <RowMeta>
              {products.filter((p) => p.categoryId === c.id).length} produk{c.active ? "" : " · disembunyikan"}
            </RowMeta>
          </>
        )}
      />
      {editing && (
        <CategoryEditor
          key={editing.item.id || "new"}
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
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const close = () => {
    setOpen(false);
    setTimeout(onClose, 200);
  };
  return (
    <Drawer
      open={open}
      onClose={close}
      size="sm"
      title={isNew ? "Kategori baru" : draft.name}
      footer={
        <EditorFooter
          disabled={!draft.name.trim()}
          onDelete={!isNew && !inUse ? () => setConfirmDelete(true) : undefined}
          onSave={() => {
            let id = draft.id;
            if (isNew) {
              id = slugId(draft.name);
              if (categories.some((c) => c.id === id)) id = makeId("categories");
            }
            saveCategory({ ...draft, id, name: draft.name.trim() });
            close();
          }}
        />
      }
    >
      <div className="space-y-4">
        <Field label="Nama">
          <input className="field-input" data-autofocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Urutan" hint="Angka kecil tampil lebih dulu.">
          <input className="field-input" type="number" value={draft.order} onChange={(e) => setDraft({ ...draft, order: Number(e.target.value) || 0 })} />
        </Field>
        <Toggle label="Tampil di kasir" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
        {inUse && <p className="field-hint">Kategori yang masih dipakai produk tidak bisa dihapus, hanya disembunyikan.</p>}
      </div>
      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus kategori?"
        message={`Kategori "${initial.name}" akan dihapus.`}
        confirmLabel="Ya, hapus"
        tone="danger"
        onConfirm={() => {
          deleteCategory(initial);
          close();
        }}
      />
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Item stok                                                           */
/* ------------------------------------------------------------------ */

function StockItemsSection() {
  const { stockItems, config } = useShop();
  const [editing, setEditing] = useState<{ item: StockItem; isNew: boolean } | null>(null);
  return (
    <>
      <SectionIntro>
        Item stok adalah barang yang dihitung di rak atau freezer. Produk memotong satu atau beberapa item stok saat terjual.
      </SectionIntro>
      <RecordList
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
            <RowTitle>{s.name}</RowTitle>
            <RowMeta>
              {findUnit(config.units, s.unit).label}
              {s.ownerProductId ? " · stok sendiri produk" : ""}
              {s.active ? "" : " · nonaktif"}
            </RowMeta>
          </>
        )}
      />
      {editing && <StockItemEditor key={editing.item.id || "new"} initial={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

function StockItemEditor({ initial, isNew, onClose }: { initial: StockItem; isNew: boolean; onClose: () => void }) {
  const { config, stockItems } = useShop();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(initial);
  const unit = findUnit(config.units, draft.unit);
  const [lowText, setLowText] = useState(initial.lowAt !== undefined ? formatUnitNumber(initial.lowAt, unit) : "");
  const close = () => {
    setOpen(false);
    setTimeout(onClose, 200);
  };
  return (
    <Drawer
      open={open}
      onClose={close}
      size="sm"
      title={isNew ? "Item stok baru" : draft.name}
      footer={
        <EditorFooter
          disabled={!draft.name.trim()}
          onSave={() => {
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
            close();
          }}
        />
      }
    >
      <div className="space-y-4">
        <Field label="Nama">
          <input className="field-input" data-autofocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Bahan A" />
        </Field>
        <Field group label="Satuan" hint={isNew ? undefined : "Tidak bisa diganti setelah dibuat: stok tersimpan dalam satuan ini."}>
          <SelectMenu
            label="Satuan"
            disabled={!isNew}
            value={draft.unit}
            onChange={(v) => setDraft({ ...draft, unit: v })}
            options={config.units.filter((u) => !u.hidden || u.code === draft.unit).map((u) => ({ value: u.code, label: u.label }))}
          />
        </Field>
        <Field label={`Tanda menipis di bawah (${unit.label})`} hint="Kosongkan bila tidak perlu.">
          <input className="field-input" inputMode="decimal" value={lowText} onChange={(e) => setLowText(e.target.value)} />
        </Field>
        <Toggle label="Aktif" detail="Item nonaktif tidak tampil di Stok dan tidak bisa dipilih produk." checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
        <p className="field-hint">Item stok tidak dihapus karena pesanan lama mencatatnya.</p>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Satuan                                                              */
/* ------------------------------------------------------------------ */

function UnitsSection() {
  const { config, products, stockItems } = useShop();
  const { user } = useAuth();
  const [editing, setEditing] = useState<{ unit: Unit; isNew: boolean } | null>(null);
  const inUse = (code: string) => products.some((p) => p.unit === code) || stockItems.some((s) => s.unit === code);
  return (
    <>
      <SectionIntro>Satuan jual dan satuan stok. Satuan yang dipakai tidak bisa dihapus, hanya disembunyikan.</SectionIntro>
      <RecordList
        items={config.units.map((u) => ({ ...u, id: u.code }))}
        addLabel="Tambah satuan"
        empty="Belum ada satuan."
        onAdd={() => setEditing({ unit: { code: "", label: "", factor: 1, decimals: 0, step: 1 }, isNew: true })}
        onOpen={(u) => setEditing({ unit: u, isNew: false })}
        render={(u) => (
          <>
            <RowTitle>{u.label}</RowTitle>
            <RowMeta>
              {u.factor > 1 ? `disimpan dalam ${u.baseLabel ?? "satuan dasar"} (×${u.factor}) · ` : ""}
              {u.decimals > 0 ? `${u.decimals} desimal` : "bilangan bulat"}
              {u.hidden ? " · disembunyikan" : ""}
              {inUse(u.code) ? " · dipakai" : ""}
            </RowMeta>
          </>
        )}
      />
      {editing && (
        <UnitEditor
          key={editing.unit.code || "new"}
          initial={editing.unit}
          isNew={editing.isNew}
          used={inUse(editing.unit.code)}
          others={config.units.filter((u) => u.code !== editing.unit.code)}
          onSave={(unit) =>
            saveShopConfig(
              { ...config, units: editing.isNew ? [...config.units, unit] : config.units.map((u) => (u.code === unit.code ? unit : u)) },
              user?.email ?? "",
            )
          }
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
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<Unit>(initial);
  const [stepText, setStepText] = useState(String(initial.step).replace(".", ","));
  const unit: Unit = { ...draft, code: isNew ? unitCodeFromLabel(draft.label) : draft.code, step: Number(stepText.replace(",", ".")) || 0 };
  const problem = draft.label ? validateUnit(unit, others) : null;
  const close = () => {
    setOpen(false);
    setTimeout(onClose, 200);
  };
  return (
    <Drawer
      open={open}
      onClose={close}
      size="sm"
      title={isNew ? "Satuan baru" : draft.label}
      footer={
        <EditorFooter
          disabled={!draft.label.trim() || Boolean(validateUnit(unit, others))}
          onSave={() => {
            onSave(unit);
            close();
          }}
        />
      }
    >
      <div className="space-y-4">
        <Field label="Nama satuan">
          <input className="field-input" data-autofocus value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="ikat" />
        </Field>
        <Field
          label="Faktor satuan dasar"
          hint={used ? "Tidak bisa diganti: produk/stok sudah tersimpan dengan faktor ini." : "1 untuk satuan hitungan. 1000 untuk kg (disimpan gram) atau liter (disimpan ml)."}
        >
          <input
            className="field-input"
            type="number"
            min={1}
            disabled={used}
            value={draft.factor}
            onChange={(e) => setDraft({ ...draft, factor: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
          />
        </Field>
        {draft.factor > 1 && (
          <Field label="Nama satuan dasar">
            <input className="field-input" value={draft.baseLabel ?? ""} onChange={(e) => setDraft({ ...draft, baseLabel: e.target.value || undefined })} placeholder="gram" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desimal">
            <input className="field-input" type="number" min={0} max={3} value={draft.decimals} onChange={(e) => setDraft({ ...draft, decimals: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Langkah +/-">
            <input className="field-input" inputMode="decimal" value={stepText} onChange={(e) => setStepText(e.target.value)} />
          </Field>
        </div>
        <Toggle label="Sembunyikan dari pilihan baru" checked={Boolean(draft.hidden)} onChange={(v) => setDraft({ ...draft, hidden: v || undefined })} />
        {problem && <p className="field-error">{problem}</p>}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Cabang                                                              */
/* ------------------------------------------------------------------ */

function BranchesSection() {
  const { branches } = useShop();
  const [editing, setEditing] = useState<{ branch: Branch; isNew: boolean } | null>(null);
  return (
    <>
      <SectionIntro>Setiap cabang punya stok dan nomor pesanan sendiri. Staf ditempatkan di satu cabang.</SectionIntro>
      <RecordList
        items={branches}
        addLabel="Tambah cabang"
        empty="Belum ada cabang."
        onAdd={() => setEditing({ branch: { id: "", name: "", code: "", active: true, order: branches.length }, isNew: true })}
        onOpen={(branch) => setEditing({ branch, isNew: false })}
        render={(b) => (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
              {b.code}
            </span>
            <div>
              <RowTitle>{b.name}</RowTitle>
              {!b.active && <RowMeta>Diarsip</RowMeta>}
            </div>
          </div>
        )}
      />
      {editing && <BranchEditor key={editing.branch.id || "new"} initial={editing.branch} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

function BranchEditor({ initial, isNew, onClose }: { initial: Branch; isNew: boolean; onClose: () => void }) {
  const { branches } = useShop();
  const { user } = useAuth();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(initial);
  const codeTaken = isNew && branches.some((b) => b.code === draft.code);
  const valid = draft.name.trim() && BRANCH_CODE_PATTERN.test(draft.code) && !codeTaken;
  const close = () => {
    setOpen(false);
    setTimeout(onClose, 200);
  };
  return (
    <Drawer
      open={open}
      onClose={close}
      size="sm"
      title={isNew ? "Cabang baru" : draft.name}
      footer={
        <EditorFooter
          disabled={!valid}
          onSave={() => {
            let id = draft.id;
            if (isNew) {
              id = slugId(draft.name);
              if (branches.some((b) => b.id === id)) id = draft.code.toLowerCase();
            }
            saveBranch({ ...draft, id, name: draft.name.trim() }, isNew, user?.email ?? "");
            close();
          }}
        />
      }
    >
      <div className="space-y-4">
        <Field label="Nama cabang">
          <input className="field-input" data-autofocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cabang A" />
        </Field>
        <Field
          label="Kode"
          hint={isNew ? "2–6 huruf besar/angka, masuk ke nomor pesanan. Tidak bisa diganti setelah dibuat." : "Kode tidak bisa diganti."}
          error={codeTaken ? "Kode ini sudah dipakai cabang lain." : undefined}
        >
          <input
            className="field-input uppercase font-bold"
            disabled={!isNew}
            maxLength={6}
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
            placeholder="CBA"
          />
        </Field>
        <Field label="Header struk cabang (opsional)" hint="Menimpa header toko, mis. alamat cabang. Satu baris per baris.">
          <textarea
            className="field-input"
            rows={3}
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
/* Perangkat                                                           */
/* ------------------------------------------------------------------ */

function DeviceSection() {
  const { setup, clear } = useDevice();
  const { branches } = useShop();
  const [confirm, setConfirm] = useState(false);
  const branch = branches.find((b) => b.id === setup?.branchId);
  return (
    <div className="card card-pad space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn("rounded-xl bg-zinc-50 p-3")}>
          <p className="text-sm text-zinc-500">Cabang</p>
          <p className="font-bold">{branch?.name}</p>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-sm text-zinc-500">Huruf perangkat</p>
          <p className="text-xl font-bold">{setup?.deviceLetter}</p>
        </div>
      </div>
      <p className="field-hint">Mengganti setup tidak mengubah pesanan lama. Pastikan huruf baru tidak dipakai perangkat lain yang masih aktif.</p>
      <button className="btn-neutral w-full" onClick={() => setConfirm(true)}>
        Ganti setup perangkat
      </button>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Ganti setup perangkat?"
        message="Perangkat ini akan meminta pilihan cabang dan huruf lagi."
        confirmLabel="Ya, ganti"
        onConfirm={clear}
      />
    </div>
  );
}
