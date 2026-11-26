import { getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Boxes, History, PackagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "../components/Drawer";
import { SelectMenu } from "../components/SelectMenu";
import { Empty, Field, SegmentedControl } from "../components/ui";
import { shopCol, shopDoc } from "../data/paths";
import type { StockChange, StockItem } from "../domain/types";
import { useAuth } from "../features/auth/AuthContext";
import { useBranch } from "../features/orders/BranchContext";
import { adjustStock } from "../features/orders/orderActions";
import { useShop } from "../features/shop/ShopContext";
import { stockLevelState } from "../features/stock/consumption";
import { findUnit, formatQuantity, formatUnitNumber, parseQuantityInput } from "../features/units/units";
import { getBusinessDate, getBusinessTime } from "../lib/businessDate";
import { cn } from "../lib/cn";

/** Stok per cabang: lihat, stok masuk, hitung ulang, dan Riwayat. */
export default function StockPage() {
  const { stockItems, branches, config } = useShop();
  const { branch, inventory } = useBranch();
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";
  const [branchId, setBranchId] = useState(branch?.id ?? "");
  const [otherLevels, setOtherLevels] = useState<Record<string, number> | null>(null);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [history, setHistory] = useState<StockChange[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const isOwn = branchId === branch?.id;

  useEffect(() => {
    if (isOwn) return setOtherLevels(null);
    return onSnapshot(shopDoc("inventory", branchId), (snap) =>
      setOtherLevels(((snap.data() as { levels?: Record<string, number> } | undefined)?.levels) ?? {}),
    );
  }, [branchId, isOwn]);

  const levels = isOwn ? (inventory?.levels ?? {}) : (otherLevels ?? {});
  const items = stockItems.filter((s) => s.active);
  const attention = items.filter((s) => stockLevelState(levels[s.id] ?? 0, s) !== "ok").length;

  const openHistory = () => {
    setHistoryOpen(true);
    setHistory(null);
    // Dibaca saat diminta, bukan listener: riwayat jarang dibuka (hemat kuota).
    getDocs(query(shopCol("stockChanges"), where("branchId", "==", branchId), orderBy("changedAt", "desc"), limit(50)))
      .then((snap) => setHistory(snap.docs.map((d) => d.data() as StockChange)))
      .catch(() => {
        setHistory([]);
        toast.error("Riwayat gagal dimuat. Periksa koneksi.");
      });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isOwner && branches.length > 1 && (
          <SelectMenu
            className="w-full sm:w-56"
            label="Cabang"
            value={branchId}
            onChange={setBranchId}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <div className="flex-1">
          {attention > 0 && (
            <span className="pill bg-amber-100 text-amber-800">{attention} item menipis atau habis</span>
          )}
        </div>
        <button className="btn-neutral" onClick={openHistory}>
          <History size={18} /> Riwayat
        </button>
      </div>

      {items.length === 0 ? (
        <Empty
          icon={<Boxes size={40} />}
          title="Belum ada item stok"
          detail={isOwner ? "Tambahkan di Pengaturan → Item stok, atau pilih cara hitung stok di produk." : undefined}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const level = levels[item.id] ?? 0;
            const state = stockLevelState(level, item);
            const unit = findUnit(config.units, item.unit);
            return (
              <li key={item.id}>
                <button
                  onClick={() => setEditing(item)}
                  className={cn(
                    "card card-pad flex w-full items-center justify-between gap-3 text-left transition duration-200 active:scale-[0.98] hover:border-zinc-300",
                    state === "low" && "card-warn",
                    state === "empty" && "card-danger",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{item.name}</span>
                    {state !== "ok" ? (
                      <span className={cn("pill mt-1", state === "low" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700")}>
                        {state === "low" ? "Menipis" : "Habis"}
                      </span>
                    ) : (
                      <span className="block text-sm text-zinc-500">Ketuk untuk ubah</span>
                    )}
                  </span>
                  <span className="text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatUnitNumber(level, unit)}
                    <span className="ml-1 text-sm font-medium text-zinc-500">{unit.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <AdjustSheet item={editing} branchId={branchId} current={editing ? (levels[editing.id] ?? 0) : 0} onClose={() => setEditing(null)} />

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Riwayat stok" bodyClassName="p-0">
        {history === null ? (
          <p className="p-4 text-sm text-zinc-500">Memuat…</p>
        ) : history.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Belum ada perubahan manual.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {history.map((h) => {
              const item = stockItems.find((s) => s.id === h.stockItemId);
              const unit = findUnit(config.units, item?.unit ?? "");
              return (
                <li key={h.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{item?.name ?? h.stockItemId}</p>
                    <span className={cn("pill", h.kind === "add" ? "bg-brand-100 text-brand-700" : "bg-zinc-100 text-zinc-700")}>
                      {h.kind === "add" ? "Stok masuk" : "Hitung ulang"}
                    </span>
                  </div>
                  <p className="text-sm tabular-nums">
                    {formatQuantity(h.before, unit)} → <span className="font-bold">{formatQuantity(h.after, unit)}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {getBusinessDate(config.timezone, h.changedAt)} {getBusinessTime(config.timezone, h.changedAt)} · {h.changedBy}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Drawer>
    </div>
  );
}

function AdjustSheet({
  item,
  branchId,
  current,
  onClose,
}: {
  item: StockItem | null;
  branchId: string;
  current: number;
  onClose: () => void;
}) {
  const { config } = useShop();
  const { actor } = useAuth();
  const [mode, setMode] = useState<"add" | "set">("add");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [shown, setShown] = useState<StockItem | null>(item);
  useEffect(() => {
    if (!item) return;
    setShown(item);
    setMode("add");
    setText("");
    setNote("");
  }, [item]);
  if (!shown) return null;
  const unit = findUnit(config.units, shown.unit);
  const value = mode === "set" && text.trim() === "0" ? 0 : parseQuantityInput(text, unit);
  const after = value === null ? null : mode === "add" ? current + value : value;

  return (
    <Drawer
      open={item !== null}
      onClose={onClose}
      size="sm"
      title={shown.name}
      footer={
        <button
          className="btn-primary w-full"
          disabled={value === null}
          onClick={() => {
            adjustStock({
              branchId,
              stockItemId: shown.id,
              mode,
              value: value!,
              current,
              note: note.trim() || undefined,
              by: actor,
            });
            toast.success("Stok disimpan");
            onClose();
          }}
        >
          <PackagePlus size={18} /> Simpan
        </button>
      }
    >
      <div className="space-y-4">
        <div className="card card-tint card-pad flex items-center justify-between">
          <span className="text-sm font-medium text-brand-700">Sekarang</span>
          <span className="text-xl font-bold tabular-nums">{formatQuantity(current, unit)}</span>
        </div>
        <SegmentedControl
          className="w-full"
          value={mode}
          onChange={setMode}
          options={[
            { value: "add", label: "Stok masuk" },
            { value: "set", label: "Hitung ulang" },
          ]}
        />
        <Field label={mode === "add" ? `Jumlah masuk (${unit.label})` : `Hasil hitung (${unit.label})`}>
          <input
            className="field-input h-14 text-2xl font-bold tabular-nums"
            inputMode="decimal"
            data-autofocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <Field label="Catatan (opsional)">
          <input className="field-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {after !== null && (
          <p className="text-base">
            Menjadi <span className="font-bold tabular-nums">{formatQuantity(after, unit)}</span>
          </p>
        )}
      </div>
    </Drawer>
  );
}
