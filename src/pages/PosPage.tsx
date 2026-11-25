import { ChevronDown, CircleCheck, Plus, Printer, Scale, ShoppingCart, SlidersHorizontal, Trash2, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CLOSE_ICON_SIZE, Drawer } from "../components/Drawer";
import { ProductImage } from "../components/ProductImage";
import { ReceiptSheet } from "../components/ReceiptSheet";
import { CheckRow, Confirm, SegmentedControl, Stepper } from "../components/ui";
import type { LineChoice, Order, PaymentMethod, Product, Unit } from "../domain/types";
import { useBranch } from "../features/orders/BranchContext";
import { formatOrderNumberShort } from "../features/orders/orderNumber";
import { changeDue, cashSuggestions } from "../features/pos/cart";
import { usePosState, type PosState } from "../features/pos/usePosState";
import { formatAmount, formatRupiah, parseRupiahInput } from "../features/pricing/money";
import { basePriceFor, lineTotal, unitPriceFor } from "../features/pricing/pricing";
import { setTillBusy } from "../features/pwa/appUpdate";
import { useShop } from "../features/shop/ShopContext";
import { groupPickCount, stockLevelState, togglePick, validateChoices, type Shortage } from "../features/stock/consumption";
import { useIsDesktop } from "../features/ui/useIsDesktop";
import { findUnit, formatQuantity, formatUnitNumber, parseQuantityInput, stepBase } from "../features/units/units";
import { cn } from "../lib/cn";

/**
 * Kasir. Menu satu kolom (Haoshii): seluruh baris menambah satu, stepper
 * muncul di baris begitu produk ada di keranjang, jadi tidak perlu bolak-balik
 * membuka keranjang. Keranjang adalah kolom tetap dari `lg`, dan sheet di HP
 * yang dibuka dari bar mengambang di atas nav bawah.
 */
export default function PosPage() {
  const pos = usePosState();
  const { categories, config, features } = useShop();
  const { branch, inventoryMissing } = useBranch();
  const isDesktop = useIsDesktop();
  const [category, setCategory] = useState("all");
  const [weightFor, setWeightFor] = useState<Product | null>(null);
  const [choiceFor, setChoiceFor] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [done, setDone] = useState<{ order: Order; change: number | null } | null>(null);
  const [receiptFor, setReceiptFor] = useState<Order | null>(null);
  const branchId = branch?.id ?? "";

  const anyOverlay = Boolean(weightFor || choiceFor || cartOpen || checkoutOpen || done || receiptFor);
  useEffect(() => {
    setTillBusy(anyOverlay || pos.cart.length > 0);
  }, [anyOverlay, pos.cart.length]);

  const usedCategories = useMemo(() => {
    const ids = new Set(pos.sellable.map((p) => p.categoryId ?? ""));
    return categories.filter((c) => c.active && ids.has(c.id));
  }, [categories, pos.sellable]);
  const visible = category === "all" ? pos.sellable : pos.sellable.filter((p) => (p.categoryId ?? "") === category);
  const cartCount = pos.cart.length;

  const tap = (product: Product) => {
    if (product.soldBy === "weight") return setWeightFor(product);
    if (product.choiceGroups?.length) return setChoiceFor(product);
    pos.add(product);
  };

  const cartHeaderActions = cartCount > 0 && (
    <button
      onClick={() => setConfirmClear(true)}
      aria-label="Hapus semua item"
      className="btn-icon btn-ghost hover:text-red-600 hover:bg-red-50"
    >
      <Trash2 size={18} />
    </button>
  );

  const cartFooter = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-600">Total</span>
        <span className="font-bold text-2xl text-brand-700 tabular-nums">{formatRupiah(pos.total)}</span>
      </div>
      <button
        className="btn-primary w-full"
        disabled={cartCount === 0}
        onClick={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
      >
        Bayar
      </button>
    </div>
  );

  return (
    <div className="lg:flex lg:items-start lg:gap-4">
      <section className="flex-1 min-w-0">
        {inventoryMissing && (
          <p className="card card-danger mb-2 p-3 text-sm text-red-700">
            Dokumen stok cabang {branch?.name} belum ada. Pemilik perlu menyimpan ulang cabang ini di Pengaturan → Cabang,
            atau menjalankan seed.
          </p>
        )}
        {features.stockTracking && <StockStrip />}
        {usedCategories.length > 1 && (
          <SegmentedControl
            scrollable
            className="mb-2"
            value={category}
            onChange={setCategory}
            options={[{ value: "all", label: "Semua" }, ...usedCategories.map((c) => ({ value: c.id, label: c.name }))]}
          />
        )}
        {visible.length === 0 ? (
          <div className="card p-8 text-center text-sm text-zinc-500">
            Belum ada produk untuk cabang ini. Tambahkan di Pengaturan → Produk.
          </div>
        ) : (
          <div className={cn("space-y-2", cartCount > 0 ? "pb-cart-bar lg:pb-0" : "pb-2")}>
            {visible.map((p) => (
              <ProductRow key={p.id} product={p} pos={pos} branchId={branchId} units={config.units} onTap={() => tap(p)} />
            ))}
          </div>
        )}
      </section>

      {isDesktop ? (
        <aside className="w-[400px] xl:w-[420px] shrink-0 sticky top-0 bg-white rounded-xl border border-zinc-200 flex flex-col p-5 max-h-[calc(100dvh-2rem)]">
          <div className="flex items-center justify-between mb-5 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-brand-700" />
              <h3 className="font-bold text-xl">Keranjang</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-brand-500/10 text-brand-700 rounded-xl text-sm font-bold">{cartCount} item</span>
              {cartHeaderActions}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain space-y-2 pr-2 -mr-2">
            <CartLines pos={pos} />
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-200 border-dashed shrink-0">{cartFooter}</div>
        </aside>
      ) : (
        <Drawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          header={
            <div className="h-14 px-4 border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-brand-700" />
                <h3 className="font-bold text-lg">Keranjang</h3>
                <span className="px-2 py-1 bg-brand-500/10 text-brand-700 rounded-xl text-xs font-bold">{cartCount} item</span>
              </div>
              <div className="flex items-center gap-1">
                {cartHeaderActions}
                <button onClick={() => setCartOpen(false)} aria-label="Tutup keranjang" className="btn-icon btn-ghost">
                  <ChevronDown size={CLOSE_ICON_SIZE} />
                </button>
              </div>
            </div>
          }
          footer={cartFooter}
          bodyClassName="p-4 space-y-2"
        >
          <CartLines pos={pos} />
        </Drawer>
      )}

      {/* Di atas nav bawah, tempat ibu jari berada setelah mengetuk menu. */}
      {!isDesktop && cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-above-nav inset-x-0 z-30 mx-3 mb-3 h-14 px-4 rounded-xl bg-brand-500 text-brand-fg flex items-center justify-between gap-3 shadow-lg active:scale-[0.98] transition duration-200"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="relative shrink-0">
              <ShoppingCart size={18} />
              <span className="absolute -top-1.5 -right-2 min-w-[1.1rem] h-[1.1rem] px-1 bg-white text-brand-700 text-xs font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            </span>
            <span className="font-bold text-sm truncate tabular-nums">{formatRupiah(pos.total)}</span>
          </span>
          <span className="font-bold text-sm shrink-0">Lihat keranjang</span>
        </button>
      )}

      <WeightSheet product={weightFor} pos={pos} branchId={branchId} units={config.units} onClose={() => setWeightFor(null)} />
      <ChoiceSheet product={choiceFor} pos={pos} branchId={branchId} onClose={() => setChoiceFor(null)} />
      <CheckoutSheet
        open={checkoutOpen}
        pos={pos}
        onClose={() => setCheckoutOpen(false)}
        onDone={(order, change) => {
          setCheckoutOpen(false);
          setDone({ order, change });
        }}
      />
      <DoneDialog done={done} onClose={() => setDone(null)} onPrint={() => setReceiptFor(done?.order ?? null)} />
      <ReceiptSheet order={receiptFor} open={receiptFor !== null} onClose={() => setReceiptFor(null)} />
      <Confirm
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Kosongkan keranjang?"
        message="Semua item di keranjang akan dihapus."
        confirmLabel="Ya, kosongkan"
        tone="danger"
        onConfirm={pos.clear}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Sisa stok di atas menu, HP saja (desktop: di sidebar). */
function StockStrip() {
  const { stockItems, config } = useShop();
  const { inventory } = useBranch();
  const items = stockItems.filter((s) => s.active);
  if (!inventory || items.length === 0) return null;
  return (
    <div className="card mb-2 p-1 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
      {items.map((item) => {
        const level = inventory.levels[item.id] ?? 0;
        const state = stockLevelState(level, item);
        return (
          <span
            key={item.id}
            className={cn(
              "shrink-0 rounded-lg px-2 py-1 min-w-[5.5rem]",
              state === "low" && "bg-amber-50 text-amber-800",
              state === "empty" && "bg-red-50 text-red-700",
            )}
          >
            <span className="block text-sm font-bold tabular-nums whitespace-nowrap">
              {formatQuantity(Math.max(level, 0), findUnit(config.units, item.unit))}
            </span>
            <span className={cn("block text-xs truncate max-w-[8rem]", state === "ok" && "text-zinc-500")}>{item.name}</span>
          </span>
        );
      })}
    </div>
  );
}

function ProductRow({
  product,
  pos,
  branchId,
  units,
  onTap,
}: {
  product: Product;
  pos: PosState;
  branchId: string;
  units: Unit[];
  onTap: () => void;
}) {
  const { features } = useShop();
  const showPhoto = features.productPhotos;
  const unit = findUnit(units, product.unit);
  const step = stepBase(unit);
  const opensSheet = product.soldBy === "weight" || Boolean(product.choiceGroups?.length);
  const canAdd = opensSheet || pos.fits(product, step) || !pos.blockOnStock;
  const short = !opensSheet && !pos.fits(product, step);
  const lines = pos.priced.filter((l) => l.productId === product.id);
  const simpleLine = !opensSheet ? lines[0] : undefined;
  const inCart = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div
      onClick={() => canAdd && onTap()}
      aria-disabled={!canAdd || undefined}
      className={cn(
        "flex items-center gap-3 card p-2 pl-3 min-h-[4.5rem] transition duration-200 select-none",
        canAdd && "cursor-pointer active:scale-[0.98]",
        inCart > 0
          ? "border-brand-500/40 bg-brand-500/[0.03] hover:bg-brand-500/[0.06]"
          : canAdd && "hover:bg-zinc-50 hover:border-zinc-300",
        !canAdd && "opacity-60",
      )}
    >
      {showPhoto && <ProductImage imageKey={product.image} name={product.name} className="w-14 h-14 -ml-1 rounded-xl" />}
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-sm md:text-base text-zinc-900 leading-[1.2] line-clamp-2">{product.name}</h3>
        <div className="flex flex-wrap items-baseline gap-x-2 mt-0.5">
          <span className="text-brand-700 font-bold text-sm md:text-base whitespace-nowrap tabular-nums">
            {formatRupiah(basePriceFor(product, branchId))}
            {product.soldBy === "weight" && <span className="font-medium text-zinc-500">/{unit.label}</span>}
          </span>
          {short && (
            <span className={cn("font-medium text-sm whitespace-nowrap", pos.blockOnStock ? "text-red-700" : "text-amber-700")}>
              Stok tidak cukup
            </span>
          )}
          {opensSheet && inCart > 0 && (
            <span className="text-sm font-medium text-zinc-500 whitespace-nowrap">
              {product.soldBy === "weight" ? formatQuantity(inCart, unit) : `${formatUnitNumber(inCart, unit)} ${unit.label}`} di
              keranjang
            </span>
          )}
        </div>
      </div>
      {simpleLine ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Stepper
            label={product.name}
            value={formatUnitNumber(simpleLine.quantity, unit)}
            atMinimum={simpleLine.quantity <= step}
            canIncrease={!pos.blockOnStock || pos.fits(product, step)}
            onDecrease={() => pos.step(simpleLine.key, -1)}
            onIncrease={() => pos.step(simpleLine.key, 1)}
            onRemove={() => pos.setQuantity(simpleLine.key, 0)}
          />
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTap();
          }}
          disabled={!canAdd}
          aria-label={`Tambah ${product.name}`}
          className="btn-icon btn-secondary"
        >
          {product.soldBy === "weight" ? <Scale size={18} /> : product.choiceGroups?.length ? <SlidersHorizontal size={18} /> : <Plus size={18} />}
        </button>
      )}
    </div>
  );
}

function CartLines({ pos }: { pos: PosState }) {
  if (pos.priced.length === 0) {
    return (
      <div className="h-full min-h-48 flex flex-col items-center justify-center text-zinc-400 text-center p-8">
        <ShoppingCart size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium">Keranjang masih kosong</p>
      </div>
    );
  }
  return (
    <>
      {pos.priced.map((line) => {
        const step = stepBase(line.unit);
        return (
          <div key={line.key} className="flex items-center gap-2 bg-white py-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm md:text-base leading-tight text-zinc-900">{line.product.name}</p>
              {line.choices?.length ? (
                <p className="text-xs md:text-sm text-zinc-500 leading-tight mt-0.5">
                  {line.choices.map((c) => `${c.count > 1 ? `${c.count}× ` : ""}${c.label}`).join(", ")}
                </p>
              ) : null}
              {line.product.soldBy === "weight" && (
                <p className="text-xs md:text-sm text-zinc-500 tabular-nums mt-0.5">
                  {formatQuantity(line.quantity, line.unit)} × {formatRupiah(line.price)}
                </p>
              )}
              <p className="mt-1 text-sm md:text-base text-brand-700 font-bold tabular-nums">{formatRupiah(line.total)}</p>
            </div>
            {line.product.soldBy === "weight" ? (
              <button
                className="btn-icon btn-ghost text-red-500 hover:bg-red-50"
                onClick={() => pos.setQuantity(line.key, 0)}
                aria-label={`Hapus ${line.product.name}`}
              >
                <Trash2 size={18} />
              </button>
            ) : (
              <Stepper
                label={line.product.name}
                value={formatUnitNumber(line.quantity, line.unit)}
                atMinimum={line.quantity <= step}
                canIncrease={!pos.blockOnStock || pos.fits(line.product, step, line.choices)}
                onDecrease={() => pos.step(line.key, -1)}
                onIncrease={() => pos.step(line.key, 1)}
                onRemove={() => pos.setQuantity(line.key, 0)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */

function WeightSheet({
  product,
  pos,
  branchId,
  units,
  onClose,
}: {
  product: Product | null;
  pos: PosState;
  branchId: string;
  units: Unit[];
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const shown = useLast(product);
  useEffect(() => {
    if (product) setText("");
  }, [product]);
  if (!shown) return null;
  const unit = findUnit(units, shown.unit);
  const base = parseQuantityInput(text, unit);
  const price = basePriceFor(shown, branchId);
  const fits = base ? pos.fits(shown, base) : true;
  const blocked = !fits && pos.blockOnStock;
  const submit = () => {
    if (!base || blocked) return;
    pos.add(shown, base);
    onClose();
  };
  return (
    <Drawer
      open={product !== null}
      onClose={onClose}
      size="sm"
      title={shown.name}
      footer={
        <button className="btn-primary w-full" disabled={!base || blocked} onClick={submit}>
          {base ? `Tambah · ${formatRupiah(lineTotal(price, base, unit.factor))}` : "Tambah"}
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
          <span className="field-label">Berat ({unit.label})</span>
          <input
            className="field-input h-14 text-2xl font-bold tabular-nums"
            inputMode="decimal"
            data-autofocus
            placeholder={`mis. ${formatUnitNumber(Math.round(1.5 * unit.factor), unit)}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="text-sm text-zinc-500 tabular-nums">
          {formatRupiah(price)}/{unit.label}
          {base ? ` · ${formatQuantity(base, unit)}` : ""}
        </p>
        {text && !base && <p className="field-error">Berat tidak valid.</p>}
        {!fits && (
          <p className={cn("text-sm font-medium", blocked ? "text-red-700" : "text-amber-700")}>Stok tidak cukup untuk berat ini.</p>
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
  product: Product | null;
  pos: PosState;
  branchId: string;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<LineChoice[]>([]);
  const shown = useLast(product);
  useEffect(() => {
    if (product) setChoices([]);
  }, [product]);
  if (!shown) return null;
  const problem = validateChoices(shown, choices);
  const fits = problem ? true : pos.fits(shown, 1, choices);
  const blocked = !fits && pos.blockOnStock;
  const price = unitPriceFor(shown, branchId, choices);
  return (
    <Drawer
      open={product !== null}
      onClose={onClose}
      title={shown.name}
      footer={
        <div className="space-y-2">
          {problem && <p className="text-sm font-medium text-zinc-600">{problem}</p>}
          {!problem && !fits && (
            <p className={cn("text-sm font-medium", blocked ? "text-red-700" : "text-amber-700")}>Stok tidak cukup untuk pilihan ini.</p>
          )}
          <button
            className="btn-primary w-full"
            disabled={Boolean(problem) || blocked}
            onClick={() => {
              pos.add(shown, undefined, choices);
              onClose();
            }}
          >
            Tambah · {formatRupiah(price)}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {(shown.choiceGroups ?? []).map((group) => {
          const count = groupPickCount(choices, group.id);
          const complete = count >= group.min && count <= group.max;
          return (
            <section key={group.id}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-bold text-base">{group.label}</h3>
                <span className={cn("pill", complete ? "bg-brand-100 text-brand-700" : "bg-zinc-100 text-zinc-600")}>
                  {count}/{group.max}
                  {group.min === 0 ? " · opsional" : ""}
                </span>
              </div>
              <ul className="space-y-2">
                {group.options
                  .filter((o) => o.active !== false)
                  .map((o) => {
                    const picked = choices.find((c) => c.groupId === group.id && c.optionId === o.id)?.count ?? 0;
                    const single = group.max === 1 || !group.allowRepeat;
                    return (
                      <li
                        key={o.id}
                        className={cn(
                          "flex items-center justify-between gap-2 card p-2 pl-3 transition duration-200",
                          picked > 0 && "border-brand-500/40 bg-brand-500/[0.03]",
                        )}
                      >
                        <span className="text-sm md:text-base font-medium">
                          {o.label}
                          {o.priceDelta ? <span className="text-zinc-500"> +{formatRupiah(o.priceDelta)}</span> : null}
                        </span>
                        {single ? (
                          <button
                            className={picked ? "btn-primary btn-sm" : "btn-neutral btn-sm"}
                            onClick={() => setChoices((c) => togglePick(group, c, o.id, picked ? -1 : 1))}
                          >
                            {picked ? "Dipilih" : "Pilih"}
                          </button>
                        ) : (
                          <Stepper
                            label={o.label}
                            value={picked}
                            atMinimum={false}
                            canIncrease={count < group.max}
                            onDecrease={() => setChoices((c) => togglePick(group, c, o.id, -1))}
                            onIncrease={() => setChoices((c) => togglePick(group, c, o.id, 1))}
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

/**
 * Satu alur checkout (Haoshii): setiap pesanan mulai sama, "Bayar nanti"
 * satu-satunya yang mengubahnya. Pesanan jadi "ambil nanti" bila dibayar
 * nanti atau diberi waktu ambil; tidak pernah dipilih langsung.
 */
function CheckoutSheet({
  open,
  pos,
  onClose,
  onDone,
}: {
  open: boolean;
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
  const [payLater, setPayLater] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // Tidak pernah diisi otomatis: kasir mengetik uang yang benar-benar diterima.
  const [cashText, setCashText] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pickup, setPickup] = useState("");
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCashText("");
    setError("");
    setShortages([]);
  }, [open]);

  const cash = parseRupiahInput(cashText);
  const change = method === "cash" && cash !== null ? changeDue(cash, pos.total) : null;
  const isPreorder = payLater || Boolean(pickup);

  const submit = (override = false) => {
    setError("");
    if (payLater && !name.trim()) {
      setError("Isi nama pelanggan untuk pesanan Bayar nanti.");
      nameRef.current?.focus();
      return;
    }
    const result = pos.checkout({
      orderType: isPreorder ? "preorder" : "instant",
      payment: payLater ? null : { method, ...(method === "cash" && cash !== null ? { cashReceived: cash } : {}) },
      customerName: name,
      customerContact: contact,
      pickupTime: pickup || undefined,
      overrideStock: override,
    });
    if (result.ok) {
      toast.success(`Pesanan ${formatOrderNumberShort(result.order.orderNumber)} tersimpan`);
      onDone(result.order, result.order.cashReceived !== undefined ? changeDue(result.order.cashReceived, result.order.totalAmount) : null);
      setName("");
      setContact("");
      setPickup("");
      setPayLater(false);
      return;
    }
    setShortages(result.shortages ?? []);
    setError(result.message);
  };

  const cashShort = !payLater && method === "cash" && (cash === null || cash < pos.total);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Bayar ${formatRupiah(pos.total)}`}
      footer={
        <div className="space-y-2">
          {error && (
            <div role="alert" className="card card-danger p-3 text-sm text-red-700">
              <p className="font-bold">{error}</p>
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
            <button
              className="btn-primary w-full h-12 text-base"
              disabled={!pos.isCheckoutReady || cashShort}
              onClick={() => submit()}
            >
              {!pos.isCheckoutReady ? "Menunggu data cabang…" : payLater ? "Simpan pesanan" : `Bayar ${formatRupiah(pos.total)}`}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {features.preorder && <CheckRow checked={payLater} onChange={setPayLater} label="Bayar nanti (saat diambil)" />}

        {!payLater && (
          <div className="space-y-3">
            {methods.length > 1 && <SegmentedControl className="w-full" value={method} onChange={setMethod} options={methods} />}
            {method === "cash" && (
              <div className="space-y-2">
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {cashSuggestions(pos.total).map((v) => (
                    <button key={v} className="btn-neutral tabular-nums" onClick={() => setCashText(String(v))}>
                      {v === pos.total ? "Uang pas" : formatRupiah(v)}
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
              </div>
            )}
          </div>
        )}

        {(features.customers || payLater) && (
          <div className="space-y-2">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                ref={nameRef}
                className="field-input pl-10"
                value={name}
                maxLength={100}
                autoCapitalize="words"
                onChange={(e) => setName(e.target.value)}
                placeholder={payLater ? "Nama pelanggan" : "Nama untuk dipanggil"}
                autoComplete="off"
              />
            </div>
            {features.customers && (
              <input
                className="field-input"
                type="tel"
                inputMode="tel"
                maxLength={50}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="No. HP"
                autoComplete="off"
              />
            )}
            {features.preorder && (
              <label className="block">
                <span className="field-label">Waktu ambil {payLater ? "" : "(bila diambil nanti)"}</span>
                <input className="field-input" type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} />
              </label>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function DoneDialog({
  done,
  onClose,
  onPrint,
}: {
  done: { order: Order; change: number | null } | null;
  onClose: () => void;
  onPrint: () => void;
}) {
  const { features } = useShop();
  const shown = useLast(done);
  return (
    <Drawer open={done !== null} onClose={onClose} variant="dialog" size="xs" bodyClassName="p-6">
      {shown && (
        <div className="space-y-4 text-center">
          <CircleCheck size={48} className="mx-auto text-brand-500" />
          <div>
            <p className="text-sm text-zinc-500">Nomor pesanan</p>
            <p className="text-5xl font-bold tabular-nums tracking-tight">{formatOrderNumberShort(shown.order.orderNumber)}</p>
          </div>
          <p className="text-lg font-bold tabular-nums">{formatRupiah(shown.order.totalAmount)}</p>
          {shown.change !== null && (
            <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 font-bold text-brand-700">
              <span>Kembalian</span>
              <span className="text-2xl tabular-nums">{formatRupiah(shown.change)}</span>
            </div>
          )}
          {shown.order.paymentStatus === "unpaid" && (
            <p className="card card-warn p-3 text-sm text-amber-800">Belum dibayar. Terima pembayaran di tab Pesanan.</p>
          )}
          <div className="space-y-2">
            {features.receipt && (
              <button className="btn-neutral w-full" onClick={onPrint}>
                <Printer size={18} /> Cetak struk
              </button>
            )}
            <button className="btn-primary w-full" onClick={onClose}>
              Pesanan baru
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** Nilai terakhir yang bukan null, supaya isi sheet tidak hilang saat animasi keluar. */
function useLast<T>(value: T | null): T | null {
  const ref = useRef<T | null>(value);
  if (value !== null) ref.current = value;
  return ref.current;
}
