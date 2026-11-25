import { AlertCircle, Boxes, ClipboardList, LogOut, Settings, ShoppingCart, UserRound } from "lucide-react";
import { type ReactNode } from "react";
import { CLIENT } from "../client";
import { useAuth } from "../features/auth/AuthContext";
import { emailToUsername } from "../features/auth/claims";
import { useDevice } from "../features/device/DeviceContext";
import { useBranch } from "../features/orders/BranchContext";
import { useShop } from "../features/shop/ShopContext";
import { useOnline } from "../features/ui/useOnline";
import { stockLevelState } from "../features/stock/consumption";
import { findUnit, formatQuantity } from "../features/units/units";
import { cn } from "../lib/cn";
import type { Route } from "../lib/route";
import { ActionMenu } from "./ActionMenu";
import { ShopLogo } from "./ShopLogo";
import { bottomNavBoxClass, bottomNavItemClass, bottomNavLabelClass, CountBadge, navItemClass } from "./ui";

const NAV: { route: Route; label: string; icon: typeof ShoppingCart; ownerOnly?: boolean }[] = [
  { route: "/", label: "Kasir", icon: ShoppingCart },
  { route: "/pesanan", label: "Pesanan", icon: ClipboardList },
  { route: "/stok", label: "Stok", icon: Boxes },
  { route: "/pengaturan", label: "Pengaturan", icon: Settings, ownerOnly: true },
];

/**
 * Shell dari Haoshii: di HP, isi + nav bawah (dengan menu Akun); dari `lg`,
 * kartu navigasi 224px yang menempel di kiri `app-shell` yang di tengah, dan
 * sisa stok cabang di bawahnya supaya terlihat dari setiap tab.
 */
export function AppShell({
  route,
  navigate,
  badges,
  children,
}: {
  route: Route;
  navigate: (route: Route) => void;
  badges?: Partial<Record<Route, number>>;
  children: ReactNode;
}) {
  const { config, branches } = useShop();
  const { branch } = useBranch();
  const { setup } = useDevice();
  const { claims, user, logout } = useAuth();
  const online = useOnline();
  const isOwner = claims?.role === "owner";
  const { features } = useShop();
  const items = NAV.filter((n) => (!n.ownerOnly || isOwner) && (n.route !== "/stok" || features.stockTracking));
  const username = emailToUsername(user?.email, CLIENT.usernameDomain);
  const where = branch ? `${branches.length > 1 ? `${branch.name} · ` : ""}Perangkat ${setup?.deviceLetter}` : "";

  const accountHeader = (
    <div>
      <p className="font-bold text-zinc-900">{username}</p>
      <p className="text-sm text-zinc-500">
        {isOwner ? "Pemilik" : "Staf"}
        {where ? ` · ${where}` : ""}
      </p>
    </div>
  );
  const accountItems = [{ label: "Keluar", icon: <LogOut size={18} />, danger: true, onSelect: () => void logout() }];

  return (
    <div className="flex h-[100dvh] bg-zinc-50 overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden pb-nav-safe lg:pb-0">
        {!online && (
          <div
            role="status"
            className="lg:hidden shrink-0 flex items-center justify-center gap-2 min-h-7 bg-yellow-100 text-yellow-800 text-xs font-bold pt-safe"
          >
            <AlertCircle size={16} /> Mode offline · pesanan tetap tersimpan di HP ini
          </div>
        )}

        <div id="page-scroller" className="flex-1 overflow-y-auto p-4 pt-safe-4 lg:pt-4">
          <div className="lg:app-shell lg:flex lg:gap-4">
            <aside className="hidden lg:flex flex-col gap-3 w-56 shrink-0 sticky top-0 z-40 self-start max-h-[calc(100dvh-2rem)]">
              <div className="card flex flex-col min-h-0">
                <div className="shrink-0 flex flex-col items-center gap-2 px-4 pt-5 pb-4 text-center">
                  <ShopLogo logo={config.logo} legacyUrl={config.logoUrl} name={config.name} />
                  <h1 className="font-bold text-lg leading-tight text-zinc-900">{config.name}</h1>
                  {where && <span className="text-xs font-medium text-zinc-500">{where}</span>}
                  {!online && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full flex items-center gap-1">
                      <AlertCircle size={14} /> Offline
                    </span>
                  )}
                </div>
                <nav className="min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-1">
                  {items.map((n) => (
                    <button
                      key={n.route}
                      onClick={() => navigate(n.route)}
                      aria-current={route === n.route ? "page" : undefined}
                      className={navItemClass(route === n.route)}
                    >
                      <n.icon size={20} />
                      <span>{n.label}</span>
                      {badges?.[n.route] ? <CountBadge count={String(badges[n.route])} className="ml-auto" /> : null}
                    </button>
                  ))}
                  <ActionMenu
                    label="Akun"
                    placement="right"
                    header={accountHeader}
                    items={accountItems}
                    trigger={
                      <>
                        <UserRound size={20} />
                        <span className="truncate">{username}</span>
                      </>
                    }
                    triggerClassName={(open) => cn(navItemClass(open), "justify-start")}
                  />
                </nav>
              </div>
              {features.stockTracking && <StockList onOpen={() => navigate("/stok")} />}
            </aside>

            <main className="flex-1 min-w-0">
              <div className="page-rail">{children}</div>
            </main>
          </div>
        </div>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-start h-nav-safe bg-white border-t border-zinc-200">
        {items.map((n) => {
          const active = route === n.route;
          return (
            <button
              key={n.route}
              onClick={() => navigate(n.route)}
              aria-current={active ? "page" : undefined}
              className={bottomNavItemClass(active)}
            >
              <span className={bottomNavBoxClass}>
                <span className="relative">
                  <n.icon size={20} />
                  {badges?.[n.route] ? (
                    <CountBadge count={String(badges[n.route])} className="absolute -top-2 left-3.5 h-5 min-w-5 px-1.5 text-xs" />
                  ) : null}
                </span>
                <span className={bottomNavLabelClass(active)}>{n.label}</span>
              </span>
            </button>
          );
        })}
        <ActionMenu
          className="w-full min-w-0"
          label="Akun"
          placement="above"
          header={accountHeader}
          items={accountItems}
          trigger={
            <span className={bottomNavBoxClass}>
              <UserRound size={20} />
              <span className={bottomNavLabelClass(false)}>Akun</span>
            </span>
          }
          triggerClassName={(open) => bottomNavItemClass(open)}
        />
      </nav>
    </div>
  );
}

/** Sisa stok cabang di sidebar desktop. Hanya item yang menipis/habis yang diberi warna. */
function StockList({ onOpen }: { onOpen: () => void }) {
  const { stockItems, config } = useShop();
  const { inventory } = useBranch();
  const items = stockItems.filter((s) => s.active);
  if (!inventory || items.length === 0) return null;
  const shown = items.slice(0, 8);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card p-2 text-left transition duration-200 hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span className="block px-2 pb-1.5 mb-1 border-b border-zinc-100 text-sm font-bold text-zinc-900">Sisa stok</span>
      {shown.map((item) => {
        const level = inventory.levels[item.id] ?? 0;
        const state = stockLevelState(level, item);
        return (
          <span
            key={item.id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5",
              state === "low" && "bg-amber-50 text-amber-800",
              state === "empty" && "bg-red-50 text-red-700",
            )}
          >
            <span className={cn("min-w-0 truncate text-sm", state === "ok" && "text-zinc-500")}>{item.name}</span>
            <span className="text-sm font-bold tabular-nums whitespace-nowrap">
              {formatQuantity(Math.max(level, 0), findUnit(config.units, item.unit))}
            </span>
          </span>
        );
      })}
      {items.length > shown.length && (
        <span className="block px-2 pt-1 text-xs font-medium text-zinc-500">+{items.length - shown.length} lainnya</span>
      )}
    </button>
  );
}
