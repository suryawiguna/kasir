/**
 * Cetak lewat browser, jalur cadangan bila Web Bluetooth tidak ada (iOS,
 * Firefox) (port `browserPrint.ts` Haoshii).
 *
 * `window.print()` saja tidak cukup: aplikasi kasir dipasang sebagai PWA
 * (`display: standalone`), dan di jendela standalone iOS maupun WebAPK Android
 * panggilan itu diam-diam tidak melakukan apa-apa. Jadi di mode standalone
 * struk dibuka ulang sebagai halaman biasa yang bisa mencetak.
 *
 * Jendela yang dibuka dari PWA di iOS tidak punya tombol kembali sama sekali,
 * sehingga halaman itu membawa tombol Tutup dan Cetak lagi sendiri (disembunyikan
 * saat dicetak), dipasang dari sisi ini, bukan `onclick` inline, supaya CSP
 * nanti tidak mematikan satu-satunya jalan keluar.
 *
 * Cabang standalone diputuskan **sinkron di dalam klik**: `window.open` dari
 * timeout sudah kehilangan gestur pengguna dan diblokir.
 */

/** Elemen salinan cetak yang ditampilkan stylesheet print (lihat ReceiptPrintCopy). */
export const RECEIPT_PRINT_ID = "receipt-print";

export type PrintOutcome =
  /** Diserahkan ke dialog cetak browser. */
  | "dialog"
  /** Dibuka ulang di jendela browser yang mencetak dirinya sendiri. */
  | "window"
  /** Browser menolak membuka jendela. */
  | "blocked"
  /** Tidak ada salinan struk di halaman. */
  | "missing";

/** Tampilan aplikasi terpasang, tanpa menu browser. `minimal-ui` masih punya menu cetak. */
export const isStandaloneDisplay = (): boolean => {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return (["standalone", "fullscreen"] as const).some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches === true,
  );
};

/** Semua stylesheet halaman, dengan URL absolut karena salinan ditulis ke `about:blank`. */
const collectStyles = (): string =>
  Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
    .map((node) =>
      node.tagName === "LINK" ? `<link rel="stylesheet" href="${(node as HTMLLinkElement).href}">` : node.outerHTML,
    )
    .join("\n");

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const CLOSE_ID = "receipt-close";
const REPRINT_ID = "receipt-reprint";

/** Satu tangan di HP: tombol 48px, menempel di atas walau struk panjang digulir. */
const TOOLBAR_STYLES = `
  .receipt-actions { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; padding: 8px;
    background: #fff; border-bottom: 1px solid #e4e4e7; font-family: system-ui, -apple-system, sans-serif; }
  .receipt-actions button { flex: 1; min-height: 48px; padding: 0 12px; border-radius: 12px;
    border: 1px solid #d4d4d8; background: #fff; color: #18181b; font-size: 16px; font-weight: 700; }
  .receipt-actions button.primary { background: #18181b; border-color: #18181b; color: #fff; }
  @media print { .receipt-actions { display: none !important; } }
`;

const TOOLBAR_HTML =
  `<div class="receipt-actions">` +
  `<button type="button" id="${CLOSE_ID}" class="primary">Tutup</button>` +
  `<button type="button" id="${REPRINT_ID}">Cetak lagi</button>` +
  `</div>`;

const openReceiptWindow = (title: string): PrintOutcome => {
  const source = document.getElementById(RECEIPT_PRINT_ID);
  if (!source) return "missing";
  const win = window.open("", "_blank");
  if (!win) return "blocked";

  const receipt = source.cloneNode(true) as HTMLElement;
  // Id tetap: stylesheet print yang ikut disalin menyembunyikan semua anak <body> selain id ini.
  // `.print-only` tersembunyi sampai @media print; halaman ini juga dilihat di layar.
  receipt.classList.remove("print-only");

  win.document.write(
    `<!doctype html><html lang="id"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escapeHtml(title)}</title>` +
      collectStyles() +
      `<style>body{margin:0;background:#fff}${TOOLBAR_STYLES}</style>` +
      `</head><body>${TOOLBAR_HTML}${receipt.outerHTML}</body></html>`,
  );
  win.document.close();

  win.document.getElementById(CLOSE_ID)?.addEventListener("click", () => win.close());
  win.document.getElementById(REPRINT_ID)?.addEventListener("click", () => {
    win.focus();
    win.print();
  });

  const print = () => {
    try {
      win.focus();
      win.print();
    } catch (error) {
      // Jendela tetap terbuka dengan struk dan tombol Tutup: buntu yang terlihat, bukan jebakan.
      if (import.meta.env.DEV) console.warn("Jendela struk menolak mencetak", error);
    }
  };
  // Tunggu stylesheet, atau struk tercetak sebagai teks polos.
  if (win.document.readyState === "complete") window.setTimeout(print, 300);
  else win.addEventListener("load", () => window.setTimeout(print, 300));
  return "window";
};

/** Cetak salinan struk yang sedang ada di halaman. */
export const printReceiptDocument = (title: string): PrintOutcome => {
  if (!document.getElementById(RECEIPT_PRINT_ID)) return "missing";
  if (!isStandaloneDisplay()) {
    // Judul dokumen = nama file saat "Simpan sebagai PDF".
    const previous = document.title;
    document.title = title;
    window.print();
    document.title = previous;
    return "dialog";
  }
  return openReceiptWindow(title);
};
