import { Component, type ReactNode } from "react";

/**
 * Menampilkan pesan galat juga di produksi, dengan waktu dan path. Tidak ada
 * crash reporting, jadi foto layar ini satu-satunya catatan apa yang rusak.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; at: string }> {
  state = { error: null as Error | null, at: "" };

  static getDerivedStateFromError(error: Error) {
    return { error, at: new Date().toLocaleString("id-ID") };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="card space-y-3 p-5">
          <h1 className="text-lg font-semibold">Aplikasi mengalami masalah</h1>
          <p className="text-sm text-zinc-600">Foto layar ini dan kirim ke admin, lalu muat ulang.</p>
          <pre className="overflow-auto rounded-lg bg-zinc-100 p-3 text-xs whitespace-pre-wrap">
            {this.state.error.message}
            {"\n"}
            {this.state.at} · {window.location.pathname}
          </pre>
          <button className="btn-primary w-full" onClick={() => window.location.reload()}>
            Muat ulang
          </button>
        </div>
      </div>
    );
  }
}
