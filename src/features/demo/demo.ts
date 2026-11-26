import { CLIENT } from "../../client";
import { canonicalDemoUrl, dataPrefix, parseDemoPath } from "./demoId";

/**
 * Mode demo, dibaca **sekali saat boot** dari URL, sebelum Firestore dipakai.
 * Hanya aktif bila client.json berisi `"demo": true` (klien kasir-demo). Untuk
 * klien lain semua nilai di sini netral: tanpa awalan path, tanpa base URL.
 *
 * Pindah demo = memuat halaman baru (link lain), bukan navigasi di aplikasi.
 */
export const IS_DEMO = CLIENT.demo === true;

const parsed = IS_DEMO ? parseDemoPath(window.location.pathname) : null;

if (IS_DEMO) {
  // Slug huruf besar atau tidak valid: ganti URL ke bentuk baku tanpa reload.
  const canonical = canonicalDemoUrl(window.location.pathname);
  if (canonical) history.replaceState(history.state, "", canonical + window.location.search + window.location.hash);
}

/** Id demo yang sedang dibuka, atau null di luar mode demo. */
export const DEMO_ID: string | null = parsed?.demoId ?? null;

/** Awalan URL route: `/d/aneka-ayam`, atau "". */
export const ROUTE_BASE = parsed?.base ?? "";

/** Awalan path Firestore: `["demos", id]`, atau kosong. */
export const DATA_PREFIX: readonly string[] = dataPrefix(DEMO_ID);

/**
 * Awalan kunci localStorage. Di mode demo memuat id demo, supaya dua demo di
 * satu browser tidak berbagi keranjang, setup perangkat, atau warna brand.
 */
export const STORAGE_SLUG = DEMO_ID ? `${CLIENT.slug}:${DEMO_ID}` : CLIENT.slug;
