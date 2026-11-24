import { useState } from "react";
import { CLIENT } from "../client";
import { USE_EMULATOR } from "../data/firebase";
import { useAuth } from "../features/auth/AuthContext";

const LAST_USERNAME = `${CLIENT.slug}:lastUsername`;

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem(LAST_USERNAME) ?? "");
  const [password, setPassword] = useState("");
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
      const code = (err as { code?: string }).code ?? "";
      setError(
        code === "auth/network-request-failed"
          ? "Tidak ada internet. Masuk pertama kali butuh koneksi."
          : code === "auth/too-many-requests"
            ? "Terlalu banyak percobaan. Tunggu sebentar."
            : "Username atau kata sandi salah.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">{CLIENT.name}</h1>
          <p className="text-sm text-zinc-500">Masuk ke aplikasi kasir</p>
        </div>
        <label className="block">
          <span className="label">Username</span>
          <input
            className="field"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="label">Kata sandi</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Masuk…" : "Masuk"}
        </button>
        {USE_EMULATOR && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            Mode emulator: data uji coba lokal, bukan data toko sungguhan.
          </p>
        )}
      </form>
    </div>
  );
}
