import clsx from "clsx";
import { getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Drawer, Segmented } from "../components/ui";
import { shopCol, shopDoc } from "../data/paths";
import type { StockChange, StockItem } from "../domain/types";
import { getBusinessDate, getBusinessTime } from "../lib/businessDate";
import { useAuth } from "../features/auth/AuthContext";
import { useBranch } from "../features/orders/BranchContext";
import { adjustStock } from "../features/orders/orderActions";
import { useShop } from "../features/shop/ShopContext";
import { stockLevelState } from "../features/stock/consumption";
import { findUnit, formatQuantity, parseQuantityInput } from "../features/units/units";

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
  const isOwn = branchId === branch?.id;

  useEffect(() => {
    if (isOwn) return setOtherLevels(null);
    return onSnapshot(shopDoc("inventory", branchId), (snap) =>
      setOtherLevels(((snap.data() as { levels?: Record<string, number> } | undefined)?.levels) ?? {}),
    );
  }, [branchId, isOwn]);

  const levels = isOwn ? (inventory?.levels ?? {}) : (otherLevels ?? {});
  const items = stockItems.filter((s) => s.active);

  const loadHistory = () => {
    // Dibaca saat diminta, bukan listener: riwayat jarang dibuka.
    getDocs(
      query(shopCol("stockChanges"), where("branchId", "==", branchId), orderBy("changedAt", "desc"), limit(50)),
    )
      .then((snap) => setHistory(snap.docs.map((d) => d.data() as StockChange)))
      .catch(() => toast.error("Riwayat gagal dimuat. Periksa koneksi."));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isOwner && branches.length > 1 && (
          <select className="field w-auto" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn-secondary ml-auto" onClick={loadHistory}>
          <History size={16} /> Riwayat
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">
          Belum ada item stok. {isOwner ? "Tambahkan di Pengaturan → Item stok, atau pilih mode stok di produk." : ""}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const level = levels[item.id] ?? 0;
            const state = stockLevelState(level, item);
            const unit = findUnit(config.units, item.unit);
            return (
              <li key={item.id}>
                <button
                  onClick={() => setEditing(item)}
                  className={clsx(
                    "card flex w-full items-center justify-between gap-2 p-4 text-left",
                    state === "low" && "border-amber-300 bg-amber-50",
                    state === "empty" && "border-red-300 bg-red-50",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{item.name}</span>
                    {state !== "ok" && (
                      <span className={clsx("pill", state === "low" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700")}>
                        {state === "low" ? "Menipis" : "Habis"}
                      </span>
                    )}
                  </span>
                  <span className="text-xl font-bold tabular">{formatQuantity(level, unit)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <AdjustSheet
          item={editing}
          branchId={branchId}
          current={levels[editing.id] ?? 0}
          onClose={() => setEditing(null)}
        />
      )}

      <Drawer open={history !== null} onClose={() => setHistory(null)} title="Riwayat stok">
        {history?.length === 0 && <p className="text-sm text-zinc-500">Belum ada perubahan manual.</p>}
        <ul className="divide-y divide-zinc-100 text-sm">
          {history?.map((h) => {
            const item = stockItems.find((s) => s.id === h.stockItemId);
            const unit = findUnit(config.units, item?.unit ?? "");
            return (
              <li key={h.id} className="py-2">
                <p className="font-medium">
                  {item?.name ?? h.stockItemId}: {formatQuantity(h.before, unit)} → {formatQuantity(h.after, unit)}
                </p>
                <p className="text-xs text-zinc-500">
                  {h.kind === "add" ? "Stok masuk" : "Hitung ulang"} · {getBusinessDate(config.timezone, h.changedAt)}{" "}
                  {getBusinessTime(config.timezone, h.changedAt)} · {h.changedBy}
                  {h.note ? ` · ${h.note}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
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
  item: StockItem;
  branchId: string;
  current: number;
  onClose: () => void;
}) {
  const { config } = useShop();
  const { user } = useAuth();
  const unit = findUnit(config.units, item.unit);
  const [mode, setMode] = useState<"add" | "set">("add");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const value = mode === "set" && text.trim() === "0" ? 0 : parseQuantityInput(text, unit);
  const after = value === null ? null : mode === "add" ? current + value : value;

  return (
    <Drawer
      open
      onClose={onClose}
      title={item.name}
      footer={
        <button
          className="btn-primary w-full"
          disabled={value === null}
          onClick={() => {
            adjustStock({ branchId, stockItemId: item.id, mode, value: value!, current, note: note.trim() || undefined, by: user?.email ?? "" });
            toast.success("Stok disimpan");
            onClose();
          }}
        >
          Simpan
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">
          Sekarang: <span className="font-semibold tabular">{formatQuantity(current, unit)}</span>
        </p>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "add", label: "Stok masuk" },
            { value: "set", label: "Hitung ulang" },
          ]}
        />
        <label className="block">
          <span className="label">{mode === "add" ? `Jumlah masuk (${unit.label})` : `Hasil hitung (${unit.label})`}</span>
          <input className="field text-xl tabular" inputMode="decimal" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Catatan (opsional)</span>
          <input className="field" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
        {after !== null && (
          <p className="text-sm">
            Menjadi <span className="font-semibold tabular">{formatQuantity(after, unit)}</span>
          </p>
        )}
      </div>
    </Drawer>
  );
}
