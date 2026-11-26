/**
 * Mode demo per prospek (hanya klien dengan `"demo": true` di client.json).
 * Satu project Firebase, satu link, tetapi setiap calon klien punya data
 * sendiri di `demos/{demoId}/...`. Demo dipilih dari URL: `/d/{demoId}/...`.
 * Tanpa slug = demo `contoh`.
 *
 * Modul ini murni (dites). `demo.ts` membacanya sekali saat boot.
 */

export const DEFAULT_DEMO_ID = "contoh";
export const DEMO_ID_PATTERN = /^[a-z0-9-]{2,40}$/;

export const isValidDemoId = (value: string): boolean => DEMO_ID_PATTERN.test(value);

export interface DemoPath {
  demoId: string;
  /** Awalan URL demo ini: `/d/aneka-ayam`, atau "" untuk demo bawaan di root. */
  base: string;
  /** Sisa path setelah base, selalu diawali "/". */
  rest: string;
}

/**
 * `/d/aneka-ayam/pesanan` → `{ demoId: "aneka-ayam", base: "/d/aneka-ayam", rest: "/pesanan" }`.
 * `/` atau `/pesanan` → demo `contoh` tanpa base. Slug tidak valid → `contoh` di root.
 * Huruf besar di slug dikecilkan (link yang diketik ulang dari chat).
 */
export const parseDemoPath = (pathname: string): DemoPath => {
  const match = pathname.match(/^\/d\/([^/]*)(\/.*)?$/);
  if (!match) return { demoId: DEFAULT_DEMO_ID, base: "", rest: pathname || "/" };
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Persen yang rusak: biarkan, jatuh ke validasi.
  }
  slug = slug.toLowerCase();
  if (!isValidDemoId(slug)) return { demoId: DEFAULT_DEMO_ID, base: "", rest: "/" };
  return { demoId: slug, base: `/d/${slug}`, rest: match[2] || "/" };
};

/** URL lengkap untuk satu route di demo ini. `withBase("/d/x", "/")` → `/d/x`. */
export const withBase = (base: string, route: string): string => {
  if (!base) return route || "/";
  return route === "/" || !route ? base : `${base}${route}`;
};

/** Bentuk URL yang baku, atau null bila sudah baku (slug kecil, slug salah dibuang). */
export const canonicalDemoUrl = (pathname: string): string | null => {
  const { base, rest } = parseDemoPath(pathname);
  const canonical = withBase(base, rest);
  return canonical === pathname ? null : canonical;
};

/** Segmen awal path Firestore: `["demos", id]` di mode demo, kosong untuk klien biasa. */
export const dataPrefix = (demoId: string | null): string[] => (demoId ? ["demos", demoId] : []);

/** Path Firestore lengkap: `dataPath(["demos","x"], "config", "shop")` → `demos/x/config/shop`. */
export const dataPath = (prefix: readonly string[], ...segments: string[]): string => [...prefix, ...segments].join("/");

/** Link yang dibagikan ke prospek. Demo bawaan ada di root. */
export const demoLink = (hostingUrl: string, demoId: string): string => {
  const host = hostingUrl.replace(/\/+$/, "");
  return demoId === DEFAULT_DEMO_ID ? `${host}/` : `${host}/d/${demoId}`;
};
