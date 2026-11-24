import { lazy, Suspense } from "react";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./features/auth/AuthContext";
import { ACCESS_PROBLEM_TEXT, accessProblem } from "./features/auth/claims";
import { DeviceProvider, useDevice } from "./features/device/DeviceContext";
import { BranchProvider } from "./features/orders/BranchContext";
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
        <h1 className="text-lg font-semibold">Belum ada akses</h1>
        <p className="text-sm text-zinc-600">{ACCESS_PROBLEM_TEXT[problem]}</p>
        <p className="text-xs text-zinc-500">{user.email}</p>
        <button className="btn-secondary w-full" onClick={() => void logout()}>
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
        <h1 className="text-lg font-semibold">Toko belum disiapkan</h1>
        <p className="text-sm text-zinc-600">
          {claims?.role === "owner"
            ? "Belum ada cabang. Jalankan seed toko (npm run seed) atau buat cabang pertama di bawah."
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
  const tab = route === "/pengaturan" && !isOwner ? "/" : route;

  return (
    <AppShell route={tab} navigate={navigate}>
      <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Memuat…</div>}>
        {tab === "/" && <PosPage />}
        {tab === "/pesanan" && <OrdersPage />}
        {tab === "/stok" && <StockPage />}
        {tab === "/pengaturan" && isOwner && <SettingsPage />}
      </Suspense>
    </AppShell>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-3 p-5">{children}</div>
    </div>
  );
}
