import { lazy, Suspense } from "react";
import { AppShell } from "./components/AppShell";
import { Skeleton } from "./components/ui";
import { useAuth } from "./features/auth/AuthContext";
import { ACCESS_PROBLEM_TEXT, accessProblem } from "./features/auth/claims";
import { DeviceProvider, useDevice } from "./features/device/DeviceContext";
import { BranchProvider, useBranch } from "./features/orders/BranchContext";
import { ShopProvider, useShop } from "./features/shop/ShopContext";
import { LoginPage } from "./pages/LoginPage";
import { DeviceSetupPage } from "./pages/DeviceSetupPage";
import { useRoute } from "./lib/route";

const PosPage = lazy(() => import("./pages/PosPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const StockPage = lazy(() => import("./pages/StockPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

/**
 * Router + provider saja. Tidak ada state bisnis di sini: setiap tab satu
 * file di pages/, handler pesanan di features/orders/orderActions.ts.
 *
 * Urutan gerbang: Auth → akses (claims) → data toko → setup perangkat →
 * data cabang → tab.
 */
export default function App() {
  const { loading, user, claims, logout } = useAuth();

  if (loading) return <Splash />;
  if (!user) return <LoginPage />;

  const problem = claims ? accessProblem(claims) : "no-admin";
  if (problem) {
    return (
      <Centered>
        <h1 className="text-xl font-bold">Belum ada akses</h1>
        <p className="text-sm text-zinc-500">{ACCESS_PROBLEM_TEXT[problem]}</p>
        <p className="text-xs text-zinc-400">{user.email}</p>
        <button className="btn-neutral w-full" onClick={() => void logout()}>
          Keluar
        </button>
      </Centered>
    );
  }

  return (
    <ShopProvider enabled>
      <DeviceProvider>
        <Gate />
      </DeviceProvider>
    </ShopProvider>
  );
}

function Gate() {
  const { loaded, branches } = useShop();
  const { setup } = useDevice();
  const { claims } = useAuth();

  if (!loaded) return <Splash />;
  if (branches.length === 0) {
    return (
      <Centered>
        <h1 className="text-xl font-bold">Toko belum disiapkan</h1>
        <p className="text-sm text-zinc-500">
          {claims?.role === "owner"
            ? "Belum ada cabang. Buat cabang pertama di bawah."
            : "Belum ada cabang. Minta pemilik menyiapkan toko."}
        </p>
        {claims?.role === "owner" && <DeviceSetupPage firstBranch />}
      </Centered>
    );
  }
  if (!setup) return <DeviceSetupPage />;

  return (
    <BranchProvider branchId={setup.branchId}>
      <Tabs />
    </BranchProvider>
  );
}

function Tabs() {
  const [route, navigate] = useRoute();
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";
  const { features } = useShop();
  const tab = (route === "/pengaturan" && !isOwner) || (route === "/stok" && !features.stockTracking) ? "/" : route;
  const { orders } = useBranch();
  // Pesanan yang masih perlu disiapkan atau diambil di cabang ini.
  const openOrders = orders.filter((o) => o.orderStatus === "pending" || o.orderStatus === "ready").length;

  return (
    <AppShell route={tab} navigate={navigate} badges={{ "/pesanan": openOrders }}>
      <Suspense fallback={<TabSkeleton />}>
        {tab === "/" && <PosPage />}
        {tab === "/pesanan" && <OrdersPage />}
        {tab === "/stok" && <StockPage />}
        {tab === "/pengaturan" && isOwner && <SettingsPage />}
      </Suspense>
    </AppShell>
  );
}

function TabSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
      ))}
    </div>
  );
}

function Splash() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <div className="card card-pad w-full max-w-md space-y-3">{children}</div>
    </div>
  );
}
