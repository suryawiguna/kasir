import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ClipboardList, Printer, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "../components/Drawer";
import { ReceiptSheet } from "../components/ReceiptSheet";
import { SelectMenu } from "../components/SelectMenu";
import { Confirm, Empty, PaidPill, RowChevron, SegmentedControl, StatusPill, StatusTimeline, STATUS_STYLE } from "../components/ui";
import { shopCol } from "../data/paths";
import type { Order, PaymentMethod } from "../domain/types";
import { useAuth } from "../features/auth/AuthContext";
import { ORDER_WINDOW, useBranch } from "../features/orders/BranchContext";
import { nextStatus, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../features/orders/buildOrder";
import { cancelOrder, collectPayment, markOrderUnpaid, updateOrderStatus } from "../features/orders/orderActions";
import { formatOrderNumberShort, matchesOrderNumber } from "../features/orders/orderNumber";
import { changeDue, cashSuggestions } from "../features/pos/cart";
import { formatAmount, formatRupiah, parseRupiahInput } from "../features/pricing/money";
import { useShop } from "../features/shop/ShopContext";
import { useIsDesktop } from "../features/ui/useIsDesktop";
import { useLingeringValue } from "../features/ui/useLingeringValue";
import { findUnit, formatQuantity } from "../features/units/units";
import { getBusinessDate, getBusinessTime } from "../lib/businessDate";
import { cn } from "../lib/cn";

type Filter = "all" | "open" | "unpaid";

/** Pesanan cabang perangkat ini; pemilik bisa melihat cabang lain atau semua. */
function useOrdersFeed(scope: string) {
  const { orders: branchOrders, branch } = useBranch();
  const [other, setOther] = useState<Order[] | null>(null);
  const isOwn = scope === branch?.id;

  useEffect(() => {
    if (isOwn) {
      setOther(null);
      return;
    }
    const q =
      scope === "all"
        ? query(shopCol("orders"), orderBy("createdAt", "desc"), limit(ORDER_WINDOW))
        : query(shopCol("orders"), where("branchId", "==", scope), orderBy("createdAt", "desc"), limit(ORDER_WINDOW));
    return onSnapshot(q, (snap) => setOther(snap.docs.map((d) => ({ ...(d.data() as Order), id: d.id }))));
  }, [scope, isOwn]);

  return isOwn ? branchOrders : (other ?? []);
}

const isOpen = (o: Order) => o.orderStatus === "pending" || o.orderStatus === "ready";
const isUnpaid = (o: Order) => o.paymentStatus === "unpaid" && o.orderStatus !== "cancelled";

export default function OrdersPage() {
  const { claims } = useAuth();
  const { branches, config } = useShop();
  const { branch } = useBranch();
  const isDesktop = useIsDesktop();
  const isOwner = claims?.role === "owner";
  const [scope, setScope] = useState(branch?.id ?? "all");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const orders = useOrdersFeed(scope);
  const showBranch = scope === "all";

  const counts = useMemo(
    () => ({ open: orders.filter(isOpen).length, unpaid: orders.filter(isUnpaid).length }),
    [orders],
  );

  const shown = useMemo(() => {
    let list = orders;
    if (filter === "open") list = list.filter(isOpen);
    if (filter === "unpaid") list = list.filter(isUnpaid);
    const q = search.trim();
    if (q) {
      const lower = q.toLowerCase();
      list = list.filter((o) => matchesOrderNumber(o.orderNumber, q) || (o.customerName ?? "").toLowerCase().includes(lower));
    }
    return list;
  }, [orders, filter, search]);

  const open = useLingeringValue(orders.find((o) => o.id === openId) ?? null);
  const branchCode = (id: string) => branches.find((b) => b.id === id)?.code ?? "";
  const when = (o: Order) => `${getBusinessDate(config.timezone, o.createdAt).split("-").reverse().slice(0, 2).join("/")} ${getBusinessTime(config.timezone, o.createdAt)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {isOwner && branches.length > 1 && (
          <SelectMenu
            className="lg:w-56"
            label="Cabang"
            value={scope}
            onChange={setScope}
            options={[{ value: "all", label: "Semua cabang" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          />
        )}
        <div className="relative flex-1">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input
            className="field-input pl-10 pr-10"
            placeholder="Cari nomor atau nama"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Hapus pencarian" className="btn-icon btn-ghost absolute right-0 top-0">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <SegmentedControl
        className="w-full"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Semua" },
          { value: "open", label: "Diproses", count: String(counts.open) },
          { value: "unpaid", label: "Belum bayar", count: String(counts.unpaid) },
        ]}
      />

      {shown.length === 0 ? (
        <Empty icon={<ClipboardList size={40} />} title="Tidak ada pesanan" detail={search ? "Coba kata kunci lain." : undefined} />
      ) : isDesktop ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-head">No.</th>
                <th className="table-head">Waktu</th>
                <th className="table-head">Pelanggan</th>
                <th className="table-head">Status</th>
                <th className="table-head text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} className="table-row" onClick={() => setOpenId(o.id)}>
                  <td className="table-cell font-bold tabular-nums">{formatOrderNumberShort(o.orderNumber, showBranch)}</td>
                  <td className="table-cell text-zinc-500 tabular-nums">{when(o)}</td>
                  <td className="table-cell">{o.customerName ?? <span className="text-zinc-400">-</span>}</td>
                  <td className="table-cell">
                    <span className="flex flex-wrap gap-1">
                      <StatusPill status={o.orderStatus} />
                      {isUnpaid(o) && <PaidPill paid={false} />}
                    </span>
                  </td>
                  <td className={cn("table-cell-num font-bold", o.orderStatus === "cancelled" && "line-through text-zinc-400")}>
                    {formatRupiah(o.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="card divide-y divide-zinc-100 overflow-hidden">
          {shown.map((o) => (
            <li key={o.id}>
              <button className="row-tap flex items-center gap-3" onClick={() => setOpenId(o.id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold tabular-nums">{formatOrderNumberShort(o.orderNumber, showBranch)}</span>
                    <StatusPill status={o.orderStatus} />
                    {isUnpaid(o) && <PaidPill paid={false} />}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-zinc-500">
                    {when(o)}
                    {o.customerName ? ` · ${o.customerName}` : ""}
                    {showBranch && branchCode(o.branchId) ? ` · ${branchCode(o.branchId)}` : ""}
                  </p>
                </div>
                <span className={cn("font-bold tabular-nums", o.orderStatus === "cancelled" && "line-through text-zinc-400")}>
                  {formatRupiah(o.totalAmount)}
                </span>
                <RowChevron />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-xs text-zinc-400">Menampilkan {ORDER_WINDOW} pesanan terakhir.</p>

      <OrderDetail order={open} open={openId !== null && open !== null} onClose={() => setOpenId(null)} isOwner={isOwner} />
    </div>
  );
}

function OrderDetail({ order, open, onClose, isOwner }: { order: Order | null; open: boolean; onClose: () => void; isOwner: boolean }) {
  const { config, features, branches } = useShop();
  const { actor: by } = useAuth();
  const [collecting, setCollecting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmUnpaid, setConfirmUnpaid] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  useEffect(() => {
    if (!open) setReceiptOpen(false);
  }, [open]);
  if (!order) return null;
  const next = nextStatus(order.orderStatus);
  const cancelled = order.orderStatus === "cancelled";
  const branch = branches.find((b) => b.id === order.branchId);
  const NextIcon = next ? STATUS_STYLE[next].Icon : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      header={
        <div className="px-4 pt-2 pb-3 lg:pt-3 border-b border-zinc-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-xl tabular-nums">Pesanan {formatOrderNumberShort(order.orderNumber)}</h3>
              <p className="text-sm text-zinc-500">
                {getBusinessDate(config.timezone, order.createdAt)} {getBusinessTime(config.timezone, order.createdAt)}
                {branches.length > 1 && branch ? ` · ${branch.name}` : ""}
              </p>
            </div>
            <button onClick={onClose} aria-label="Tutup" className="btn-icon btn-ghost -mr-2">
              <X size={28} />
            </button>
          </div>
        </div>
      }
      footer={
        features.receipt || (!cancelled && isOwner) ? (
          <div className="space-y-2">
            {features.receipt && (
              <button className="btn-secondary w-full" onClick={() => setReceiptOpen(true)}>
                <Printer size={18} /> Cetak struk
              </button>
            )}
            {!cancelled && isOwner && (
              <div className="flex gap-2">
                {order.paymentStatus === "paid" && (
                  <button className="btn-neutral flex-1" onClick={() => setConfirmUnpaid(true)}>
                    Tandai belum bayar
                  </button>
                )}
                <button className="btn-danger-quiet flex-1" onClick={() => setConfirmCancel(true)}>
                  Batalkan
                </button>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {cancelled ? (
          <div className="card card-pad bg-zinc-50 text-sm text-zinc-600">
            <StatusPill status="cancelled" className="mb-2" />
            <p>Dibatalkan oleh {order.cancelledBy}. Stok sudah dikembalikan sesuai catatan saat jual.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <StatusTimeline status={order.orderStatus} />
            {next && NextIcon && (
              <button
                className="btn-primary w-full"
                onClick={() => {
                  updateOrderStatus(order, next, by);
                  toast.success(`Status: ${ORDER_STATUS_LABEL[next]}`);
                }}
              >
                <NextIcon size={18} /> Tandai {ORDER_STATUS_LABEL[next].toLowerCase()}
              </button>
            )}
          </div>
        )}

        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-zinc-500">Pembayaran</span>
            <span className="flex items-center gap-2">
              {order.paymentMethod && <span className="text-sm font-bold">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span>}
              <PaidPill paid={order.paymentStatus === "paid"} />
            </span>
          </div>
          {order.paymentStatus === "unpaid" && !cancelled && (
            <button className="btn-secondary w-full" onClick={() => setCollecting(true)}>
              Terima pembayaran
            </button>
          )}
          {(order.customerName || order.customerContact) && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-500">Pelanggan</span>
              <span className="text-right text-sm font-bold">
                {order.customerName}
                {order.customerContact && <span className="block font-medium text-zinc-500">{order.customerContact}</span>}
              </span>
            </div>
          )}
          {order.pickupTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-500">Waktu ambil</span>
              <span className="text-sm font-bold">{order.pickupTime.replace("T", " ")}</span>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <ul className="divide-y divide-zinc-100">
            {order.items.map((line) => {
              const unit = findUnit(config.units, line.unit);
              return (
                <li key={line.id} className="flex justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{line.name}</p>
                    {line.choices?.length ? (
                      <p className="text-sm text-zinc-500">
                        {line.choices.map((c) => `${c.count > 1 ? `${c.count}× ` : ""}${c.label}`).join(", ")}
                      </p>
                    ) : null}
                    {line.freeItems?.length ? (
                      <p className="text-sm text-brand-700">Bonus: {line.freeItems.map((f) => `${f.qty}× ${f.name}`).join(", ")}</p>
                    ) : null}
                    <p className="text-sm text-zinc-500 tabular-nums">
                      {formatQuantity(line.quantity, unit)} × {formatRupiah(line.price)}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums">{formatRupiah(line.total)}</span>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-dashed border-zinc-200 px-4 py-3 space-y-1">
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span className="text-lg text-brand-700 tabular-nums">{formatRupiah(order.totalAmount)}</span>
            </div>
            {order.cashReceived !== undefined && (
              <>
                <div className="flex justify-between text-sm text-zinc-500">
                  <span>Tunai</span>
                  <span className="tabular-nums">{formatRupiah(order.cashReceived)}</span>
                </div>
                <div className="flex justify-between text-sm text-zinc-500">
                  <span>Kembalian</span>
                  <span className="tabular-nums">{formatRupiah(changeDue(order.cashReceived, order.totalAmount))}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ReceiptSheet order={order} open={open && receiptOpen} onClose={() => setReceiptOpen(false)} />
      <CollectPaymentSheet
        open={collecting}
        order={order}
        methods={[
          { value: "cash", label: "Tunai" },
          ...(features.transfer ? [{ value: "transfer" as const, label: "Transfer" }] : []),
          ...(features.qris ? [{ value: "qris" as const, label: "QRIS" }] : []),
        ]}
        onClose={() => setCollecting(false)}
        by={by}
      />
      <Confirm
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Batalkan pesanan?"
        message="Stok yang terpotong dikembalikan sesuai catatan saat jual. Pesanan tetap tersimpan sebagai dibatalkan."
        confirmLabel="Ya, batalkan"
        tone="danger"
        onConfirm={() => {
          cancelOrder(order, by);
          toast.success("Pesanan dibatalkan");
        }}
      />
      <Confirm
        open={confirmUnpaid}
        onClose={() => setConfirmUnpaid(false)}
        title="Tandai belum bayar?"
        message="Metode bayar dan uang diterima dihapus dari pesanan ini."
        confirmLabel="Ya, tandai"
        onConfirm={() => markOrderUnpaid(order, by)}
      />
    </Drawer>
  );
}

function CollectPaymentSheet({
  open,
  order,
  methods,
  onClose,
  by,
}: {
  open: boolean;
  order: Order;
  methods: { value: PaymentMethod; label: string }[];
  onClose: () => void;
  by: string;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashText, setCashText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setCashText("");
      setError("");
    }
  }, [open]);
  const cash = parseRupiahInput(cashText);
  const change = cash !== null ? changeDue(cash, order.totalAmount) : null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="sm"
      title={`Terima ${formatRupiah(order.totalAmount)}`}
      footer={
        <button
          className="btn-primary w-full h-12 text-base"
          disabled={method === "cash" && (cash === null || cash < order.totalAmount)}
          onClick={() => {
            const message = collectPayment(order, method, method === "cash" ? (cash ?? undefined) : undefined, by);
            if (message) return setError(message);
            toast.success("Pembayaran diterima");
            onClose();
          }}
        >
          Bayar {formatRupiah(order.totalAmount)}
        </button>
      }
    >
      <div className="space-y-3">
        {methods.length > 1 && <SegmentedControl className="w-full" value={method} onChange={setMethod} options={methods} />}
        {method === "cash" && (
          <>
            <label className="block">
              <span className="field-label">Uang diterima</span>
              <input
                className="field-input h-14 text-2xl font-bold tabular-nums"
                inputMode="numeric"
                placeholder="0"
                value={cash !== null ? formatAmount(cash) : cashText}
                onChange={(e) => setCashText(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {cashSuggestions(order.totalAmount).map((v) => (
                <button key={v} className="btn-neutral tabular-nums" onClick={() => setCashText(String(v))}>
                  {v === order.totalAmount ? "Uang pas" : formatRupiah(v)}
                </button>
              ))}
            </div>
            {change !== null && (
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl px-4 py-3 font-bold",
                  change < 0 ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700",
                )}
              >
                <span>{change < 0 ? "Kurang" : "Kembalian"}</span>
                <span className="text-xl tabular-nums">{formatRupiah(Math.abs(change))}</span>
              </div>
            )}
          </>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
    </Drawer>
  );
}
