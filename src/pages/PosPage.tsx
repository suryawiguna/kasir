import clsx from "clsx";
import { Scale, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Drawer, Segmented, Stepper } from "../components/ui";
import type { LineChoice, Order, OrderType, PaymentMethod, Product } from "../domain/types";
import { formatOrderNumberShort } from "../features/orders/orderNumber";
import { changeDue, cashSuggestions } from "../features/pos/cart";
import { usePosState, type CheckoutRequest, type PosState } from "../features/pos/usePosState";
import { formatAmount, formatRupiah, parseRupiahInput } from "../features/pricing/money";
import { basePriceFor, lineTotal, unitPriceFor } from "../features/pricing/pricing";
import { useShop } from "../features/shop/ShopContext";
import { groupPickCount, togglePick, validateChoices, type Shortage } from "../features/stock/consumption";
import { findUnit, formatQuantity, formatUnitNumber, parseQuantityInput } from "../features/units/units";
import { useBranch } from "../features/orders/BranchContext";
import { setTillBusy } from "../features/pwa/appUpdate";

export default function PosPage() {
  const pos = usePosState();
  const { categories, config } = useShop();
  const { branch, inventoryMissing } = useBranch();
  const [category, setCategory] = useState<string>("all");
  const [weightFor, setWeightFor] = useState<Product | null>(null);
  const [choiceFor, setChoiceFor] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [done, setDone] = useState<{ order: Order; change: number | null } | null>(null);

  const anyOverlay = Boolean(weightFor || choiceFor || cartOpen || checkoutOpen || done);
  useEffect(() => {
    setTillBusy(anyOverlay || pos.cart.length > 0);
  }, [anyOverlay, pos.cart.length]);

  const usedCategories = useMemo(() => {
    const ids = new Set(pos.sellable.map((p) => p.categoryId ?? ""));
    return categories.filter((c) => c.active && ids.has(c.id));
  }, [categories, pos.sellable]);
  const visible = category === "all" ? pos.sellable : pos.sellable.filter((p) => (p.categoryId ?? "") === category);

  const tap = (product: Product) => {
    if (product.soldBy === "weight") return setWeightFor(product);
    if (product.choiceGroups?.length) return setChoiceFor(product);
    pos.add(product);
  };

  const itemCount = pos.cart.length;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-4">
      <section className="min-w-0">
        {inventoryMissing && (
          <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            Dokumen stok cabang {branch?.name} belum ada. Pemilik perlu membuka Pengaturan → Cabang lalu simpan cabang
            ini, atau jalankan seed.
          </p>
        )}
        {usedCategories.length > 0 && (
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip active={category === "all"} onClick={() => setCategory("all")}>
              Semua
            </Chip>
            {usedCategories.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        )}
        {visible.length === 0 ? (
          <div className="card p-8 text-center text-sm text-zinc-500">
            Belum ada produk untuk cabang ini. Tambahkan di Pengaturan → Produk.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} pos={pos} branchId={branch?.id ?? ""} onTap={() => tap(p)} />
            ))}
          </div>
        )}
      </section>

      <aside className="hidden lg:block">
        <div className="card sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col">
          <CartBody pos={pos} />
          <CartFooter pos={pos} onCheckout={() => setCheckoutOpen(true)} />
        </div>
      </aside>

      {itemCount > 0 && (
        <button
          className="btn-primary fixed inset-x-4 bottom-20 z-20 h-14 justify-between shadow-lg lg:hidden"
          onClick={() => setCartOpen(true)}
        >
          <span className="flex items-center gap-2">
            <ShoppingBag size={18} /> {itemCount} item
          </span>
          <span className="tabular">{formatRupiah(pos.total)}</span>
        </button>
      )}

      <Drawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Keranjang"
        footer={
          <CartFooter
            pos={pos}
            onCheckout={() => {
              setCartOpen(false);
              setCheckoutOpen(true);
            }}
          />
        }
      >
        <CartBody pos={pos} bare />
      </Drawer>

      {weightFor && (
        <WeightSheet
          product={weightFor}
          pos={pos}
          branchId={branch?.id ?? ""}
          onClose={() => setWeightFor(null)}
          units={config.units}
        />
      )}
      {choiceFor && <ChoiceSheet product={choiceFor} pos={pos} branchId={branch?.id ?? ""} onClose={() => setChoiceFor(null)} />}
      {checkoutOpen && (
        <CheckoutSheet
          pos={pos}
          onClose={() => setCheckoutOpen(false)}
          onDone={(order, change) => {
            setCheckoutOpen(false);
            setDone({ order, change });
          }}
        />
      )}
      <Drawer open={done !== null} onClose={() => setDone(null)} title="Pesanan tersimpan">
        {done && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-zinc-500">Nomor pesanan</p>
            <p className="text-4xl font-bold tabular">{formatOrderNumberShort(done.order.orderNumber)}</p>
            <p className="text-lg font-semibold tabular">{formatRupiah(done.order.totalAmount)}</p>
            {done.change !== null && (
              <p className="rounded-xl bg-brand-50 p-3 text-lg font-semibold text-brand-800">
                Kembalian {formatRupiah(done.change)}
              </p>
            )}
            {done.order.paymentStatus === "unpaid" && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Belum dibayar. Terima di tab Pesanan.</p>
            )}
            <button className="btn-primary w-full" onClick={() => setDone(null)}>
              Pesanan baru
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "h-9 shrink-0 rounded-full px-4 text-sm font-semibold",
        active ? "bg-brand-600 text-brand-fg" : "border border-zinc-200 bg-white text-zinc-700",
      )}
    >
      {children}
    </button>
  );
}

function ProductCard({
  product,
  pos,
  branchId,
  onTap,
}: {
  product: Product;
  pos: PosState;
  branchId: string;
  onTap: () => void;
}) {
  const { config } = useShop();
  const unit = findUnit(config.units, product.unit);
  const needsSheet = product.soldBy === "weight" || Boolean(product.choiceGroups?.length);
  const fits = needsSheet ? true : pos.fits(product, Math.max(1, Math.round(unit.step * unit.factor)));
  const blocked = !fits && pos.blockOnStock;
  const inCart = pos.cart.filter((l) => l.productId === product.id).reduce((s, l) => s + l.quantity, 0);
  return (
    <button
      onClick={onTap}
      disabled={blocked}
      className={clsx(
        "card relative flex min-h-24 flex-col items-start justify-between gap-2 p-3 text-left transition active:scale-[0.98]",
        inCart > 0 && "border-brand-600 ring-1 ring-brand-600",
        blocked && "opacity-50",
      )}
    >
      <span className="line-clamp-2 text-sm font-semibold">{product.name}</span>
      <span className="flex w-full items-end justify-between gap-1">
        <span className="text-sm text-zinc-700 tabular">
          {formatRupiah(basePriceFor(product, branchId))}
          {product.soldBy === "weight" && <span className="text-xs text-zinc-500">/{unit.label}</span>}
        </span>
        {product.soldBy === "weight" && <Scale size={14} className="text-zinc-400" />}
      </span>
      {!fits && (
        <span className={clsx("pill", blocked ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")}>
          Stok tidak cukup
        </span>
      )}
      {inCart > 0 && (
        <span className="pill absolute top-2 right-2 bg-brand-600 text-brand-fg tabular">
          {formatUnitNumber(inCart, unit)}
        </span>
      )}
    </button>
  );
}

function CartBody({ pos, bare }: { pos: PosState; bare?: boolean }) {
  if (pos.priced.length === 0) {
    return <p className={clsx("text-center text-sm text-zinc-500", !bare && "p-8")}>Keranjang kosong</p>;
  }
  return (
    <ul className={clsx("divide-y divide-zinc-100", !bare && "flex-1 overflow-y-auto px-4")}>
      {pos.priced.map((line) => (
        <li key={line.key} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{line.product.name}</p>
            {line.choices?.length ? (
              <p className="text-xs text-zinc-500">
                {line.choices.map((c) => `${c.count > 1 ? `${c.count}× ` : ""}${c.label}`).join(", ")}
              </p>
            ) : null}
            <p className="text-xs text-zinc-500 tabular">
              {line.product.soldBy === "weight"
                ? `${formatQuantity(line.quantity, line.unit)} × ${formatRupiah(line.price)}`
                : formatRupiah(line.price)}
            </p>
            <p className="text-sm font-semibold tabular">{formatRupiah(line.total)}</p>
          </div>
          {line.product.soldBy === "weight" ? (
            <button className="btn-ghost h-9 w-9 px-0" onClick={() => pos.setQuantity(line.key, 0)} aria-label="Hapus">
              <Trash2 size={16} />
            </button>
          ) : (
            <Stepper
              label={line.product.name}
              value={formatUnitNumber(line.quantity, line.unit)}
              onMinus={() => pos.step(line.key, -1)}
              onPlus={() => pos.step(line.key, 1)}
              plusDisabled={pos.blockOnStock && !pos.fits(line.product, Math.round(line.unit.step * line.unit.factor), line.choices)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function CartFooter({ pos, onCheckout }: { pos: PosState; onCheckout: () => void }) {
  return (
    <div className="space-y-2 border-t border-zinc-100 p-4 lg:p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-600">Total</span>
        <span className="text-xl font-bold tabular">{formatRupiah(pos.total)}</span>
      </div>
      <div className="flex gap-2">
        {pos.cart.length > 0 && (
          <button className="btn-secondary" onClick={pos.clear} aria-label="Kosongkan keranjang">
            <Trash2 size={16} />
          </button>
        )}
        <button className="btn-primary flex-1" disabled={pos.cart.length === 0} onClick={onCheckout}>
          Lanjut bayar
        </button>
      </div>
    </div>
  );
}

function WeightSheet({
  product,
  pos,
  branchId,
  onClose,
  units,
}: {
  product: Product;
  pos: PosState;
  branchId: string;
  onClose: () => void;
  units: import("../domain/types").Unit[];
}) {
  const unit = findUnit(units, product.unit);
  const [text, setText] = useState("");
  const base = parseQuantityInput(text, unit);
  const price = basePriceFor(product, branchId);
  const fits = base ? pos.fits(product, base) : true;
  const blocked = !fits && pos.blockOnStock;
  const submit = () => {
    if (!base || blocked) return;
    pos.add(product, base);
    onClose();
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={product.name}
      footer={
        <button className="btn-primary w-full" disabled={!base || blocked} onClick={submit}>
          Tambah {base ? formatRupiah(lineTotal(price, base, unit.factor)) : ""}
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="label">Berat ({unit.label})</span>
          <input
            className="field text-2xl font-semibold tabular"
            inputMode="decimal"
            autoFocus
            placeholder={`mis. ${formatUnitNumber(Math.round(1.5 * unit.factor), unit)}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="text-sm text-zinc-600">
          {formatRupiah(price)}/{unit.label}
          {base ? ` · ${formatQuantity(base, unit)}` : ""}
        </p>
        {text && !base && <p className="text-sm text-red-600">Berat tidak valid.</p>}
        {!fits && (
          <p className={clsx("text-sm", blocked ? "text-red-600" : "text-amber-700")}>Stok tidak cukup untuk berat ini.</p>
        )}
      </form>
    </Drawer>
  );
}

function ChoiceSheet({
  product,
  pos,
  branchId,
  onClose,
}: {
  product: Product;
  pos: PosState;
  branchId: string;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<LineChoice[]>([]);
  const problem = validateChoices(product, choices);
  const fits = problem ? true : pos.fits(product, 1, choices);
  const blocked = !fits && pos.blockOnStock;
  const price = unitPriceFor(product, branchId, choices);
  return (
    <Drawer
      open
      onClose={onClose}
      title={product.name}
      footer={
        <div className="space-y-2">
          {problem && <p className="text-sm text-zinc-600">{problem}</p>}
          {!problem && !fits && (
            <p className={clsx("text-sm", blocked ? "text-red-600" : "text-amber-700")}>Stok tidak cukup untuk pilihan ini.</p>
          )}
          <button
            className="btn-primary w-full"
            disabled={Boolean(problem) || blocked}
            onClick={() => {
              pos.add(product, undefined, choices);
              onClose();
            }}
          >
            Tambah · {formatRupiah(price)}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {(product.choiceGroups ?? []).map((group) => {
          const count = groupPickCount(choices, group.id);
          return (
            <section key={group.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-semibold">{group.label}</h3>
                <span className="text-xs text-zinc-500 tabular">
                  {count}/{group.max}
                  {group.min > 0 ? ` · wajib ${group.min === group.max ? group.min : `min ${group.min}`}` : " · opsional"}
                </span>
              </div>
              <ul className="space-y-2">
                {group.options
                  .filter((o) => o.active !== false)
                  .map((o) => {
                    const picked = choices.find((c) => c.groupId === group.id && c.optionId === o.id)?.count ?? 0;
                    const single = group.max === 1 && !group.allowRepeat;
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 p-2 pl-3">
                        <span className="text-sm">
                          {o.label}
                          {o.priceDelta ? <span className="text-zinc-500"> +{formatRupiah(o.priceDelta)}</span> : null}
                        </span>
                        {single || !group.allowRepeat ? (
                          <button
                            className={picked ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                            onClick={() => setChoices((c) => togglePick(group, c, o.id, picked ? -1 : 1))}
                          >
                            {picked ? "Dipilih" : "Pilih"}
                          </button>
                        ) : (
                          <Stepper
                            label={o.label}
                            value={picked}
                            onMinus={() => setChoices((c) => togglePick(group, c, o.id, -1))}
                            onPlus={() => setChoices((c) => togglePick(group, c, o.id, 1))}
                            plusDisabled={count >= group.max}
                          />
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}

function CheckoutSheet({
  pos,
  onClose,
  onDone,
}: {
  pos: PosState;
  onClose: () => void;
  onDone: (order: Order, change: number | null) => void;
}) {
  const { features } = useShop();
  const methods: { value: PaymentMethod; label: string }[] = [
    { value: "cash", label: "Tunai" },
    ...(features.transfer ? [{ value: "transfer" as const, label: "Transfer" }] : []),
    ...(features.qris ? [{ value: "qris" as const, label: "QRIS" }] : []),
  ];
  const [orderType, setOrderType] = useState<OrderType>("instant");
  const [payNow, setPayNow] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // Tidak pernah diisi otomatis: kasir mengetik uang yang benar-benar diterima.
  const [cashText, setCashText] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pickup, setPickup] = useState("");
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [error, setError] = useState("");

  const cash = parseRupiahInput(cashText);
  const change = method === "cash" && cash !== null ? changeDue(cash, pos.total) : null;
  const isPreorder = orderType === "preorder";
  const paying = !isPreorder || payNow;

  const submit = (override = false) => {
    setError("");
    const req: CheckoutRequest = {
      orderType,
      payment: paying ? { method, ...(method === "cash" && cash !== null ? { cashReceived: cash } : {}) } : null,
      customerName: name,
      customerContact: contact,
      pickupTime: isPreorder && pickup ? pickup : undefined,
      overrideStock: override,
    };
    const result = pos.checkout(req);
    if (result.ok) {
      toast.success(`Pesanan ${formatOrderNumberShort(result.order.orderNumber)} tersimpan`);
      onDone(result.order, paying && method === "cash" ? changeDue(result.order.cashReceived ?? 0, result.order.totalAmount) : null);
      return;
    }
    setShortages(result.shortages ?? []);
    setError(result.message);
  };

  const canSubmit =
    pos.isCheckoutReady &&
    (!paying || method !== "cash" || (cash !== null && cash >= pos.total)) &&
    (!isPreorder || name.trim().length > 0);

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Bayar ${formatRupiah(pos.total)}`}
      footer={
        <div className="space-y-2">
          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold">{error}</p>
              {shortages.map((s) => (
                <p key={s.stockItemId}>{s.message}</p>
              ))}
            </div>
          )}
          {shortages.length > 0 && !pos.blockOnStock ? (
            <button className="btn-danger w-full" onClick={() => submit(true)}>
              Tetap simpan walau stok kurang
            </button>
          ) : (
            <button className="btn-primary h-12 w-full text-base" disabled={!canSubmit} onClick={() => submit()}>
              {!pos.isCheckoutReady ? "Menunggu data cabang…" : paying ? "Bayar" : "Simpan pesanan"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {features.preorder && (
          <Segmented
            value={orderType}
            onChange={(v) => {
              setOrderType(v);
              setPayNow(v === "instant");
            }}
            options={[
              { value: "instant", label: "Langsung" },
              { value: "preorder", label: "Pesanan (ambil nanti)" },
            ]}
          />
        )}
        {isPreorder && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={!payNow} onChange={(e) => setPayNow(!e.target.checked)} />
            Bayar nanti (saat diambil)
          </label>
        )}

        {paying && (
          <div className="space-y-3">
            {methods.length > 1 && <Segmented value={method} onChange={setMethod} options={methods} />}
            {method === "cash" && (
              <div className="space-y-2">
                <label className="block">
                  <span className="label">Uang diterima</span>
                  <input
                    className="field text-xl font-semibold tabular"
                    inputMode="numeric"
                    placeholder="0"
                    value={cash !== null ? formatAmount(cash) : cashText}
                    onChange={(e) => setCashText(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {cashSuggestions(pos.total).map((v) => (
                    <button key={v} className="btn-secondary btn-sm tabular" onClick={() => setCashText(String(v))}>
                      {v === pos.total ? "Uang pas" : formatRupiah(v)}
                    </button>
                  ))}
                </div>
                {change !== null && (
                  <p className={clsx("text-lg font-semibold tabular", change < 0 ? "text-red-600" : "text-brand-700")}>
                    {change < 0 ? `Kurang ${formatRupiah(-change)}` : `Kembalian ${formatRupiah(change)}`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {(features.customers || isPreorder) && (
          <div className="space-y-3">
            <label className="block">
              <span className="label">Nama pelanggan{isPreorder ? "" : " (opsional)"}</span>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </label>
            {features.customers && (
              <label className="block">
                <span className="label">No. HP (opsional)</span>
                <input
                  className="field"
                  inputMode="tel"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            {isPreorder && (
              <label className="block">
                <span className="label">Waktu ambil (opsional)</span>
                <input className="field" type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} />
              </label>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
