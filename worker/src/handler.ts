/**
 * Worker `kasir-media`: satu-satunya yang menyentuh bucket R2 foto produk dan
 * logo. Aplikasi tidak memegang kredensial R2 (semua yang dikirim ke HP itu
 * publik), jadi unggahan datang bersama Firebase ID token dan Worker yang
 * memutuskan.
 *
 *   PUT /v1/<key>          pemilik toko. Bucket dipilih dari `aud` token.
 *   GET /v1/<slug>/<key>   publik. Foto menu dan logo bukan rahasia, dan logo
 *                          dibutuhkan di layar masuk sebelum login.
 *
 * Pola key ada di src/features/media/imageKeys.ts, dipakai bersama aplikasi.
 *
 * Cloudflare tidak punya batas pengeluaran, jadi pemeriksaan di sini adalah
 * batasnya: token pemilik yang valid, origin yang dikenal, ukuran per jenis,
 * isi benar-benar JPEG/PNG, nama = hash isi, batas laju per akun, dan batas
 * unggah harian per klien.
 *
 * Semua dependensi luar (kunci Google, waktu, cache, rate limiter) disuntik,
 * supaya handler bisa dites di Node tanpa Cloudflare.
 */

import {
  CONTENT_TYPE,
  MAX_BYTES,
  hashFromDigest,
  matchesMagicBytes,
  originalKeyOfThumb,
  parseImageKey,
} from "../../src/features/media/imageKeys";
import { isOwner, verifyIdToken, type SigningKeys } from "./token";

// --- Bentuk minimal binding Cloudflare yang dipakai ---------------------------

export interface StoredObject {
  body: ReadableStream | null;
  size: number;
  httpEtag?: string;
  text(): Promise<string>;
}

export interface BucketLike {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<StoredObject | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
}

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /**
   * JSON: `{ "<projectId Firebase>": { "slug", "bucket", "origins", "maxUploadsPerDay"? } }`.
   * `bucket` = nama binding R2 di wrangler.toml.
   */
  CLIENTS: string;
  /** "true" hanya di worker/.dev.vars untuk Auth emulator. */
  ACCEPT_EMULATOR_TOKENS?: string;
  UPLOAD_LIMITER?: RateLimiterLike;
  [binding: string]: unknown;
}

export interface Deps {
  signingKeys: SigningKeys;
  /** Milidetik sejak epoch. */
  now: () => number;
  cache?: CacheLike;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface ClientEntry {
  projectId: string;
  slug: string;
  bucket: string;
  origins: string[];
  maxUploadsPerDay: number;
}

const DEFAULT_MAX_UPLOADS_PER_DAY = 500;
const SLUG = /^[a-z0-9-]{1,40}$/;

/** Peta klien dari env. Entri yang rusak diabaikan (lebih baik menolak daripada salah bucket). */
export const parseClients = (raw: string | undefined): ClientEntry[] => {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "{}");
  } catch {
    return [];
  }
  if (!value || typeof value !== "object") return [];
  const entries: ClientEntry[] = [];
  for (const [projectId, v] of Object.entries(value as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    if (typeof e.slug !== "string" || !SLUG.test(e.slug)) continue;
    if (typeof e.bucket !== "string" || !e.bucket) continue;
    const origins = Array.isArray(e.origins) ? e.origins.filter((o): o is string => typeof o === "string") : [];
    const cap = typeof e.maxUploadsPerDay === "number" && e.maxUploadsPerDay > 0 ? e.maxUploadsPerDay : DEFAULT_MAX_UPLOADS_PER_DAY;
    entries.push({ projectId, slug: e.slug, bucket: e.bucket, origins, maxUploadsPerDay: cap });
  }
  return entries;
};

const bucketOf = (env: Env, client: ClientEntry): BucketLike | null => {
  const b = env[client.bucket] as BucketLike | undefined;
  return b && typeof b.get === "function" && typeof b.put === "function" ? b : null;
};

// --- HTTP ------------------------------------------------------------------

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const uploadCors = (origin: string): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const PUBLIC_CORS = { "Access-Control-Allow-Origin": "*" };

/** Body maksimal `max` byte. null bila lebih (tanpa membaca semuanya ke memori). */
const readLimited = async (request: Request, max: number): Promise<Uint8Array | null> => {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
};

const usageKey = (nowMs: number) => `_usage/${new Date(nowMs).toISOString().slice(0, 10)}.json`;

const readUsage = async (bucket: BucketLike, key: string): Promise<number> => {
  const obj = await bucket.get(key);
  if (!obj) return 0;
  try {
    const parsed = JSON.parse(await obj.text()) as { uploads?: unknown };
    return typeof parsed.uploads === "number" ? parsed.uploads : 0;
  } catch {
    return 0;
  }
};

const handlePut = async (request: Request, env: Env, deps: Deps, key: string): Promise<Response> => {
  const origin = request.headers.get("origin") ?? "";
  const clients = parseClients(env.CLIENTS);
  // CORS hanya untuk origin yang dikenal klien mana pun; jawaban galat tetap
  // terbaca aplikasi yang sah.
  const cors = clients.some((c) => c.origins.includes(origin)) ? uploadCors(origin) : {};

  const parsed = parseImageKey(key);
  if (!parsed) return json(400, { error: "bad_key" }, cors);

  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const claims = token
    ? await verifyIdToken(token, {
        signingKeys: deps.signingKeys,
        now: Math.floor(deps.now() / 1000),
        acceptEmulatorTokens: env.ACCEPT_EMULATOR_TOKENS === "true",
      })
    : null;
  if (!claims) return json(401, { error: "unauthorized" }, cors);

  const client = clients.find((c) => c.projectId === claims.aud);
  if (!client) return json(403, { error: "unknown_client" }, cors);
  if (!isOwner(claims)) return json(403, { error: "owner_only" }, cors);
  if (!client.origins.includes(origin)) return json(403, { error: "bad_origin" }, cors);
  const bucket = bucketOf(env, client);
  if (!bucket) return json(500, { error: "bucket_not_configured" }, cors);

  if (env.UPLOAD_LIMITER) {
    const { success } = await env.UPLOAD_LIMITER.limit({ key: `${client.projectId}:${claims.sub}` });
    if (!success) return json(429, { error: "rate_limited" }, cors);
  }

  const max = MAX_BYTES[parsed.kind];
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > max) return json(413, { error: "too_large", max }, cors);
  const body = await readLimited(request, max);
  if (!body) return json(413, { error: "too_large", max }, cors);
  if (body.byteLength === 0) return json(400, { error: "empty" }, cors);
  if (!matchesMagicBytes(body, parsed.ext)) return json(415, { error: "bad_type" }, cors);

  // Thumbnail bernama sama dengan fotonya, jadi hash-nya milik foto utama:
  // yang dicek adalah foto itu sudah ada (diunggah lebih dulu oleh aplikasi).
  if (parsed.kind === "thumb") {
    const original = originalKeyOfThumb(key);
    if (!original || !(await bucket.head(original))) return json(409, { error: "missing_original" }, cors);
  } else {
    const hash = hashFromDigest(await crypto.subtle.digest("SHA-256", body));
    if (hash !== parsed.hash) return json(422, { error: "hash_mismatch" }, cors);
  }

  // Nama berdasarkan isi: kalau sudah ada, isinya sama. Coba ulang setelah
  // jawaban yang hilang mendarat di sini dan dianggap berhasil.
  if (await bucket.head(key)) return json(200, { ok: true, key, existed: true }, cors);

  const usage = usageKey(deps.now());
  const used = await readUsage(bucket, usage);
  if (used >= client.maxUploadsPerDay) return json(429, { error: "daily_limit" }, cors);

  await bucket.put(key, body, {
    httpMetadata: { contentType: CONTENT_TYPE[parsed.ext] },
    customMetadata: { uploadedBy: claims.email ?? claims.sub, uploadedAt: new Date(deps.now()).toISOString() },
  });
  // Penghitung kira-kira: dua unggahan bersamaan bisa menghitung satu. Cukup
  // untuk batas biaya, bukan untuk tagihan.
  await bucket.put(usage, JSON.stringify({ uploads: used + 1 }), { httpMetadata: { contentType: "application/json" } });
  return json(201, { ok: true, key }, cors);
};

const handleGet = async (request: Request, env: Env, deps: Deps, slug: string, key: string): Promise<Response> => {
  const parsed = parseImageKey(key);
  const client = parseClients(env.CLIENTS).find((c) => c.slug === slug);
  if (!parsed || !client) return json(404, { error: "not_found" }, PUBLIC_CORS);

  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
  const cached = await deps.cache?.match(cacheKey);
  if (cached) return cached;

  const bucket = bucketOf(env, client);
  if (!bucket) return json(500, { error: "bucket_not_configured" }, PUBLIC_CORS);
  const obj = await bucket.get(key);
  if (!obj || !obj.body) return json(404, { error: "not_found" }, PUBLIC_CORS);

  const response = new Response(obj.body, {
    headers: {
      ...PUBLIC_CORS,
      "Content-Type": CONTENT_TYPE[parsed.ext],
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(obj.httpEtag ? { ETag: obj.httpEtag } : {}),
    },
  });
  if (deps.cache) {
    const put = deps.cache.put(cacheKey, response.clone());
    if (deps.waitUntil) deps.waitUntil(put);
    else await put;
  }
  return response;
};

export const handle = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/v1/")) return json(404, { error: "not_found" });
  const rest = pathname.slice("/v1/".length);

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin") ?? "";
    const known = parseClients(env.CLIENTS).some((c) => c.origins.includes(origin));
    return new Response(null, { status: 204, headers: known ? uploadCors(origin) : PUBLIC_CORS });
  }

  if (request.method === "PUT") return handlePut(request, env, deps, rest);

  if (request.method === "GET") {
    const slash = rest.indexOf("/");
    if (slash < 1) return json(404, { error: "not_found" }, PUBLIC_CORS);
    return handleGet(request, env, deps, decodeURIComponent(rest.slice(0, slash)), rest.slice(slash + 1));
  }

  return json(405, { error: "method_not_allowed" });
};
