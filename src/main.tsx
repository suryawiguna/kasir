import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./features/auth/AuthContext";
import { registerAppUpdates } from "./features/pwa/appUpdate";
import "./index.css";

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
