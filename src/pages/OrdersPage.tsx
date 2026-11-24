import clsx from "clsx";
import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Confirm, Drawer, Segmented } from "../components/ui";
import { shopCol } from "../data/paths";
import type { Order, PaymentMethod } from "../domain/types";
import { getBusinessDate, getBusinessTime } from "../lib/businessDate";
import { useAuth } from "../features/auth/AuthContext";
import { ORDER_WINDOW, useBranch } from "../features/orders/BranchContext";
import { nextStatus, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../features/orders/buildOrder";
import { cancelOrder, collectPayment, markOrderUnpaid, updateOrderStatus } from "../features/orders/orderActions";
import { formatOrderNumberShort, matchesOrderNumber } from "../features/orders/orderNumber";
import { changeDue, cashSuggestions } from "../features/pos/cart";
import { formatAmount, formatRupiah, parseRupiahInput } from "../features/pricing/money";
import { useShop } from "../features/shop/ShopContext";
import { findUnit, formatQuantity } from "../features/units/units";

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

export default function OrdersPage() {
  const { claims } = useAuth();
  const { branches, features, config } = useShop();
  const { branch } = useBranch();
  const isOwner = claims?.role === "owner";
  const [scope, setScope] = useState(branch?.id ?? "all");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const orders = useOrdersFeed(scope);
  const multi = branches.length > 1;

  const shown = useMemo(() => {
    let list = orders;
    if (filter === "open") list = list.filter((o) => o.orderStatus === "pending" || o.orderStatus === "ready");
    if (filter === "unpaid") list = list.filter((o) => o.paymentStatus === "unpaid" && o.orderStatus !== "cancelled");
    const q = search.trim();
    if (q) {
      const lower = q.toLowerCase();
      list = list.filter((o) => matchesOrderNumber(o.orderNumber, q) || (o.customerName ?? "").toLowerCase().includes(lower));
    }
    return list;
  }, [orders, filter, search]);

  const open = orders.find((o) => o.id === openId) ?? null;
  const branchCode = (id: string) => branches.find((b) => b.id === id)?.code ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {isOwner && multi && (features.multiBranch || branches.length > 1) && (
          <select className="field lg:w-56" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Semua cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
          <input
            className="field pl-9"
            placeholder="Cari nomor atau nama"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="lg:w-80">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Semua" },
              { value: "open", label: "Diproses" },
              { value: "unpaid", label: "Belum bayar" },
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">Tidak ada pesanan.</div>
      ) : (
        <ul className="card divide-y divide-zinc-100">
          {shown.map((o) => (
            <li key={o.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50" onClick={() => setOpenId(o.id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular">{formatOrderNumberShort(o.orderNumber, scope === "all")}</span>
                    <StatusPill order={o} />
                  </div>
                  <p className="truncate text-xs text-zinc-500">
                    {getBusinessDate(config.timezone, o.createdAt)} {getBusinessTime(config.timezone, o.createdAt)}
                    {o.customerName ? ` · ${o.customerName}` : ""}
                    {scope === "all" && branchCode(o.branchId) ? ` · ${branchCode(o.branchId)}` : ""}
                  </p>
                </div>
                <span className={clsx("text-sm font-semibold tabular", o.orderStatus === "cancelled" && "line-through text-zinc-400")}>
                  {formatRupiah(o.totalAmount)}
                </span>
                <ChevronRight size={16} className="text-zinc-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-xs text-zinc-400">Menampilkan {ORDER_WINDOW} pesanan terakhir.</p>

      {open && <OrderDetail order={open} onClose={() => setOpenId(null)} isOwner={isOwner} />}
    </div>
  );
}

function StatusPill({ order }: { order: Order }) {
  if (order.orderStatus === "cancelled") return <span className="pill bg-zinc-100 text-zinc-500">Dibatalkan</span>;
  return (
    <>
      {order.paymentStatus === "unpaid" && <span className="pill bg-amber-50 text-amber-800">Belum bayar</span>}
      {order.orderStatus !== "completed" && (
        <span className="pill bg-brand-50 text-brand-700">{ORDER_STATUS_LABEL[order.orderStatus]}</span>
      )}
    </>
  );
}

function OrderDetail({ order, onClose, isOwner }: { order: Order; onClose: () => void; isOwner: boolean }) {
  const { config, features, branches } = useShop();
  const { user } = useAuth();
  const by = user?.email ?? "";
  const [collecting, setCollecting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmUnpaid, setConfirmUnpaid] = useState(false);
  const next = nextStatus(order.orderStatus);
  const cancelled = order.orderStatus === "cancelled";
  const branch = branches.find((b) => b.id === order.branchId);

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Pesanan ${formatOrderNumberShort(order.orderNumber)}`}
      footer={
        !cancelled && (
          <div className="flex flex-col gap-2">
            {order.paymentStatus === "unpaid" && (
              <button className="btn-primary w-full" onClick={() => setCollecting(true)}>
                Terima pembayaran
              </button>
            )}
            {next && (
              <button
                className={order.paymentStatus === "unpaid" ? "btn-secondary w-full" : "btn-primary w-full"}
                onClick={() => {
                  updateOrderStatus(order, next, by);
                  toast.success(`Status: ${ORDER_STATUS_LABEL[next]}`);
                }}
              >
                Tandai {ORDER_STATUS_LABEL[next].toLowerCase()}
              </button>
            )}
            {isOwner && (
              <div className="flex gap-2">
                {order.paymentStatus === "paid" && (
                  <button className="btn-ghost flex-1" onClick={() => setConfirmUnpaid(true)}>
                    Tandai belum bayar
                  </button>
                )}
                <button className="btn-ghost flex-1 text-red-600" onClick={() => setConfirmCancel(true)}>
                  Batalkan pesanan
                </button>
              </div>
            )}
          </div>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-zinc-500">Waktu</dt>
          <dd>
            {getBusinessDate(config.timezone, order.createdAt)} {getBusinessTime(config.timezone, order.createdAt)}
          </dd>
          {branches.length > 1 && (
            <>
              <dt className="text-zinc-500">Cabang</dt>
              <dd>{branch?.name ?? order.branchId}</dd>
            </>
          )}
          <dt className="text-zinc-500">Status</dt>
          <dd>{ORDER_STATUS_LABEL[order.orderStatus]}</dd>
          <dt className="text-zinc-500">Pembayaran</dt>
          <dd>
            {order.paymentStatus === "paid"
              ? `Lunas · ${order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] : ""}`
              : "Belum bayar"}
          </dd>
          {order.customerName && (
            <>
              <dt className="text-zinc-500">Pelanggan</dt>
              <dd>
                {order.customerName}
                {order.customerContact ? ` · ${order.customerContact}` : ""}
              </dd>
            </>
          )}
          {order.pickupTime && (
            <>
              <dt className="text-zinc-500">Ambil</dt>
              <dd>{order.pickupTime.replace("T", " ")}</dd>
            </>
          )}
        </dl>

        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {order.items.map((line) => {
            const unit = findUnit(config.units, line.unit);
            return (
              <li key={line.id} className="flex justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">{line.name}</p>
                  {line.choices?.length ? (
                    <p className="text-xs text-zinc-500">
                      {line.choices.map((c) => `${c.count > 1 ? `${c.count}× ` : ""}${c.label}`).join(", ")}
                    </p>
                  ) : null}
                  {line.freeItems?.length ? (
                    <p className="text-xs text-zinc-500">Bonus: {line.freeItems.map((f) => `${f.qty}× ${f.name}`).join(", ")}</p>
                  ) : null}
                  <p className="text-xs text-zinc-500 tabular">
                    {formatQuantity(line.quantity, unit)} × {formatRupiah(line.price)}
                  </p>
                </div>
                <span className="font-semibold tabular">{formatRupiah(line.total)}</span>
              </li>
            );
          })}
          <li className="flex justify-between p-3 font-semibold">
            <span>Total</span>
            <span className="tabular">{formatRupiah(order.totalAmount)}</span>
          </li>
          {order.cashReceived !== undefined && (
            <li className="flex justify-between p-3 text-zinc-600">
              <span>Tunai {formatRupiah(order.cashReceived)}</span>
              <span className="tabular">Kembalian {formatRupiah(changeDue(order.cashReceived, order.totalAmount))}</span>
            </li>
          )}
        </ul>
        {cancelled && (
          <p className="rounded-xl bg-zinc-100 p-3 text-zinc-600">
            Dibatalkan oleh {order.cancelledBy}. Stok sudah dikembalikan.
          </p>
        )}
      </div>

      {collecting && (
        <CollectPaymentSheet
          order={order}
          methods={[
            { value: "cash", label: "Tunai" },
            ...(features.transfer ? [{ value: "transfer" as const, label: "Transfer" }] : []),
            ...(features.qris ? [{ value: "qris" as const, label: "QRIS" }] : []),
          ]}
          onClose={() => setCollecting(false)}
          by={by}
        />
      )}
      <Confirm
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Batalkan pesanan?"
        message="Stok yang terpotong akan dikembalikan sesuai catatan saat jual. Pesanan tetap tersimpan sebagai dibatalkan."
        confirmLabel="Batalkan pesanan"
        danger
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
        confirmLabel="Tandai belum bayar"
        onConfirm={() => markOrderUnpaid(order, by)}
      />
    </Drawer>
  );
}

function CollectPaymentSheet({
  order,
  methods,
  onClose,
  by,
}: {
  order: Order;
  methods: { value: PaymentMethod; label: string }[];
  onClose: () => void;
  by: string;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashText, setCashText] = useState("");
  const [error, setError] = useState("");
  const cash = parseRupiahInput(cashText);
  const change = cash !== null ? changeDue(cash, order.totalAmount) : null;
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Terima ${formatRupiah(order.totalAmount)}`}
      footer={
        <button
          className="btn-primary w-full"
          disabled={method === "cash" && (cash === null || cash < order.totalAmount)}
          onClick={() => {
            const message = collectPayment(order, method, method === "cash" ? (cash ?? undefined) : undefined, by);
            if (message) return setError(message);
            toast.success("Pembayaran diterima");
            onClose();
          }}
        >
          Bayar
        </button>
      }
    >
      <div className="space-y-3">
        {methods.length > 1 && <Segmented value={method} onChange={setMethod} options={methods} />}
        {method === "cash" && (
          <>
            <input
              className="field text-xl font-semibold tabular"
              inputMode="numeric"
              placeholder="Uang diterima"
              value={cash !== null ? formatAmount(cash) : cashText}
              onChange={(e) => setCashText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {cashSuggestions(order.totalAmount).map((v) => (
                <button key={v} className="btn-secondary btn-sm" onClick={() => setCashText(String(v))}>
                  {v === order.totalAmount ? "Uang pas" : formatRupiah(v)}
                </button>
              ))}
            </div>
            {change !== null && (
              <p className={clsx("text-lg font-semibold", change < 0 ? "text-red-600" : "text-brand-700")}>
                {change < 0 ? `Kurang ${formatRupiah(-change)}` : `Kembalian ${formatRupiah(change)}`}
              </p>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Drawer>
  );
}
