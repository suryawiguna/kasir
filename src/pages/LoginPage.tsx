import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { CLIENT } from "../client";
import { USE_EMULATOR } from "../data/firebase";
import { useAuth } from "../features/auth/AuthContext";

const LAST_USERNAME = `${CLIENT.slug}:lastUsername`;

const LOGIN_ERRORS: Record<string, string> = {
  "auth/too-many-requests": "Terlalu banyak percobaan gagal. Tunggu beberapa menit lalu coba lagi.",
  "auth/network-request-failed": "Tidak ada koneksi. Masuk pertama kali butuh internet.",
  "auth/user-disabled": "Akun ini dinonaktifkan. Hubungi pemilik toko.",
};

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem(LAST_USERNAME) ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // Login satu-satunya await yang sah: butuh jawaban server.
      await login(username, password);
      localStorage.setItem(LAST_USERNAME, username.trim());
    } catch (err) {
      setError(LOGIN_ERRORS[(err as { code?: string }).code ?? ""] ?? "Username atau kata sandi salah.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-brand-fg">
            {CLIENT.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{CLIENT.name}</h1>
            <p className="text-sm text-zinc-500">Masuk ke aplikasi kasir</p>
          </div>
        </div>
        <form onSubmit={submit} className="card card-pad space-y-4">
          <label className="block">
            <span className="field-label">Username</span>
            <input
              className="field-input"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="field-label">Kata sandi</span>
            <span className="relative block">
              <input
                className="field-input pr-12"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                aria-pressed={showPassword}
                className="btn-icon btn-ghost absolute right-0 top-1/2 -translate-y-1/2"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" size={16} />}
            {busy ? "Memproses…" : "Masuk"}
          </button>
        </form>
        {USE_EMULATOR && (
          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-center text-sm text-amber-800">
            Mode emulator: data uji coba lokal, bukan data toko sungguhan.
          </p>
        )}
      </div>
    </div>
  );
}
