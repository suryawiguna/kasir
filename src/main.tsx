import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./features/auth/AuthContext";
import { registerAppUpdates } from "./features/pwa/appUpdate";
import { applyCachedBrand } from "./features/shop/brandCache";
import "./index.css";

// Warna dan nama toko terakhir, sebelum login dan sebelum config terbaca.
applyCachedBrand();
registerAppUpdates();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
      {/* Di luar App: layar masuk juga butuh toast. */}
      <Toaster position="top-center" expand richColors closeButton />
    </ErrorBoundary>
  </StrictMode>,
);
