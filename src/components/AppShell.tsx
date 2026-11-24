import clsx from "clsx";
import { Boxes, ClipboardList, LogOut, Settings, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import { CLIENT } from "../client";
import { useAuth } from "../features/auth/AuthContext";
import { emailToUsername } from "../features/auth/claims";
import { useDevice } from "../features/device/DeviceContext";
import { useBranch } from "../features/orders/BranchContext";
import { useShop } from "../features/shop/ShopContext";
import type { Route } from "../lib/route";

const NAV: { route: Route; label: string; icon: typeof ShoppingCart; ownerOnly?: boolean }[] = [
  { route: "/", label: "Kasir", icon: ShoppingCart },
  { route: "/pesanan", label: "Pesanan", icon: ClipboardList },
  { route: "/stok", label: "Stok", icon: Boxes },
  { route: "/pengaturan", label: "Pengaturan", icon: Settings, ownerOnly: true },
];

export function AppShell({
  route,
  navigate,
  children,
}: {
  route: Route;
  navigate: (route: Route) => void;
  children: ReactNode;
}) {
  const { config, features } = useShop();
  const { branch } = useBranch();
  const { setup } = useDevice();
  const { claims, user, logout } = useAuth();
  const items = NAV.filter((n) => !n.ownerOnly || claims?.role === "owner");

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-zinc-200 bg-white p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Brand name={config.name} logoUrl={config.logoUrl} />
        <nav className="mt-3 flex flex-col gap-1">
          {items.map((n) => (
            <button
              key={n.route}
              onClick={() => navigate(n.route)}
              className={clsx(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                route === n.route ? "bg-brand-50 text-brand-700" : "text-zinc-700 hover:bg-zinc-100",
              )}
            >
              <n.icon size={18} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
          {(features.multiBranch || claims?.role === "owner") && branch && (
            <p>
              {branch.name} · Perangkat {setup?.deviceLetter}
            </p>
          )}
          <p>{emailToUsername(user?.email, CLIENT.usernameDomain)}</p>
          <button className="btn-ghost btn-sm -ml-3" onClick={() => void logout()}>
            <LogOut size={16} /> Keluar
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/95 px-4 py-2 pt-safe backdrop-blur lg:hidden">
          <Brand name={config.name} logoUrl={config.logoUrl} compact />
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {branch && (features.multiBranch || claims?.role === "owner") && (
              <span className="pill bg-zinc-100 text-zinc-700">
                {branch.code}·{setup?.deviceLetter}
              </span>
            )}
            <button className="btn-ghost h-9 w-9 px-0" onClick={() => void logout()} aria-label="Keluar">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-200 bg-white pb-safe lg:hidden">
        {items.map((n) => (
          <button
            key={n.route}
            onClick={() => navigate(n.route)}
            className={clsx(
              "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold",
              route === n.route ? "text-brand-700" : "text-zinc-500",
            )}
          >
            <n.icon size={20} />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Brand({ name, logoUrl, compact }: { name: string; logoUrl?: string; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {logoUrl ? (
        <img src={logoUrl} alt="" className={clsx("rounded-lg object-cover", compact ? "h-8 w-8" : "h-9 w-9")} />
      ) : (
        <div
          className={clsx(
            "flex items-center justify-center rounded-lg bg-brand-600 font-bold text-brand-fg",
            compact ? "h-8 w-8 text-sm" : "h-9 w-9",
          )}
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="truncate font-semibold">{name}</span>
    </div>
  );
}
