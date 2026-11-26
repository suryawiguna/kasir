import { DEFAULT_DEMO_ID } from "../features/demo/demoId";
import { DEMO_ID } from "../features/demo/demo";

/** Slug demo yang belum di-seed (atau sudah dihapus). */
export function DemoNotFoundPage() {
  const isDefault = DEMO_ID === DEFAULT_DEMO_ID;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <div className="card card-pad w-full max-w-md space-y-3 text-center">
        <h1 className="text-xl font-bold">Demo ini belum tersedia</h1>
        <p className="text-sm text-zinc-500">
          {isDefault
            ? "Demo sedang disiapkan. Coba lagi beberapa saat lagi."
            : "Link demo ini belum dibuat atau sudah dihapus. Coba demo contoh dulu."}
        </p>
        {isDefault ? (
          <button className="btn-primary w-full" onClick={() => window.location.reload()}>
            Coba lagi
          </button>
        ) : (
          <a className="btn-primary w-full" href="/">
            Buka demo contoh
          </a>
        )}
      </div>
    </div>
  );
}
