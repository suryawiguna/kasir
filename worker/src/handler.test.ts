import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashFromDigest, productImageKey, thumbKeyOf } from "../../src/features/media/imageKeys";
import { handle, parseClients, type BucketLike, type CacheLike, type Deps, type Env, type StoredObject } from "./handler";

/**
 * Handler Worker di Node, dengan bucket di memori dan token RS256 sungguhan
 * yang ditandatangani kunci uji. Setiap pemeriksaan di handlePut punya kasus.
 */

const PROJECT = "kasir-demo";
const ORIGIN = "https://kasir-demo.web.app";
const NOW_MS = Date.UTC(2026, 10, 25, 3, 0, 0);
const NOW = Math.floor(NOW_MS / 1000);

class MemoryBucket implements BucketLike {
  store = new Map<string, Uint8Array>();
  async head(key: string) {
    const v = this.store.get(key);
    return v ? { size: v.byteLength } : null;
  }
  async get(key: string): Promise<StoredObject | null> {
    const v = this.store.get(key);
    if (!v) return null;
    return {
      body: new Response(v).body,
      size: v.byteLength,
      httpEtag: `"${key}"`,
      text: async () => new TextDecoder().decode(v),
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array | string) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.store.set(key, bytes);
  }
}

let keyPair: CryptoKeyPair;
let bucket: MemoryBucket;

const b64url = (bytes: Uint8Array | string) => {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const sign = async (claims: Record<string, unknown>, kid = "k1") => {
  const header = b64url(JSON.stringify({ alg: "RS256", kid }));
  const payload = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
};

const claims = (over: Record<string, unknown> = {}) => ({
  aud: PROJECT,
  iss: `https://securetoken.google.com/${PROJECT}`,
  sub: "uid-owner",
  iat: NOW - 60,
  exp: NOW + 3600,
  email: "owner@kasir-demo.local",
  admin: true,
  role: "owner",
  ...over,
});

const env = (over: Partial<Env> = {}): Env => ({
  CLIENTS: JSON.stringify({
    [PROJECT]: { slug: "kasir-demo", bucket: "BUCKET_KASIR_DEMO", origins: [ORIGIN], maxUploadsPerDay: 5 },
  }),
  BUCKET_KASIR_DEMO: bucket,
  ...over,
});

const deps = (over: Partial<Deps> = {}): Deps => ({
  signingKeys: async () => new Map([["k1", keyPair.publicKey]]),
  now: () => NOW_MS,
  ...over,
});

const jpeg = (fill = 1, size = 1000) => {
  const b = new Uint8Array(size).fill(fill);
  b.set([0xff, 0xd8, 0xff], 0);
  return b;
};
const png = () => {
  const b = new Uint8Array(500).fill(7);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return b;
};
const hashOf = async (bytes: Uint8Array) => hashFromDigest(await crypto.subtle.digest("SHA-256", bytes));

const put = async (key: string, body: Uint8Array, opts: { token?: string | null; origin?: string; env?: Env; deps?: Deps } = {}) => {
  const token = opts.token === undefined ? await sign(claims()) : opts.token;
  const headers: Record<string, string> = { origin: opts.origin ?? ORIGIN, "content-length": String(body.byteLength) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await handle(
    new Request(`https://media.example/v1/${key}`, { method: "PUT", headers, body }),
    opts.env ?? env(),
    opts.deps ?? deps(),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
};

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
});

beforeEach(() => {
  bucket = new MemoryBucket();
});

describe("PUT foto produk", () => {
  it("pemilik mengunggah foto dan thumbnail; isi tersimpan dengan jenis yang benar", async () => {
    const photo = jpeg();
    const key = productImageKey("as002", await hashOf(photo));
    const res = await put(key, photo);
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(bucket.store.get(key)).toEqual(photo);

    const thumb = await put(thumbKeyOf(key)!, jpeg(2, 200));
    expect(thumb.status).toBe(201);
  });

  it("unggah ulang isi yang sama: 200, tidak ditulis ulang, tidak menambah hitungan", async () => {
    const photo = jpeg();
    const key = productImageKey("as002", await hashOf(photo));
    await put(key, photo);
    const again = await put(key, photo);
    expect(again.status).toBe(200);
    expect(again.body.existed).toBe(true);
    const usage = [...bucket.store.keys()].find((k) => k.startsWith("_usage/"))!;
    expect(new TextDecoder().decode(bucket.store.get(usage))).toBe('{"uploads":1}');
  });

  it("nama tidak sama dengan hash isi: 422", async () => {
    const res = await put(productImageKey("as002", "0123456789abcdef"), jpeg());
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("hash_mismatch");
  });

  it("thumbnail tanpa foto utama: 409", async () => {
    const res = await put(thumbKeyOf(productImageKey("as002", "0123456789abcdef"))!, jpeg());
    expect(res.status).toBe(409);
  });

  it("bukan JPEG: 415", async () => {
    const fake = new Uint8Array(500).fill(1);
    const res = await put(productImageKey("as002", await hashOf(fake)), fake);
    expect(res.status).toBe(415);
  });

  it("terlalu besar menurut header atau isi sebenarnya: 413", async () => {
    const big = jpeg(1, 301 * 1024);
    const res = await put(productImageKey("as002", await hashOf(big)), big);
    expect(res.status).toBe(413);

    // Header berbohong (kecil), body besar.
    const token = await sign(claims());
    const lie = await handle(
      new Request(`https://media.example/v1/${productImageKey("as002", await hashOf(big))}`, {
        method: "PUT",
        headers: { origin: ORIGIN, authorization: `Bearer ${token}`, "content-length": "10" },
        body: big,
      }),
      env(),
      deps(),
    );
    expect(lie.status).toBe(413);
  });

  // `..` sudah dinormalkan oleh URL sebelum sampai ke handler, jadi yang
  // diperiksa adalah path hasil normalisasi; yang dikodekan (%2F) tetap ditolak.
  it("path aneh ditolak sebelum token diperiksa", async () => {
    for (const key of ["products/a%2Fb/0123456789abcdef.jpg", "products/a/b/0123456789abcdef.jpg", "random.jpg", "brand/logo/0123456789abcdef.gif", "_usage/2026-11-25.json"]) {
      const res = await put(key, jpeg(), { token: null });
      expect(res.status, key).toBe(400);
    }
  });
});

describe("PUT logo", () => {
  it("PNG dan JPEG diterima, ekstensi harus cocok dengan isi", async () => {
    const p = png();
    expect((await put(`brand/logo/${await hashOf(p)}.png`, p)).status).toBe(201);
    const j = jpeg(3);
    expect((await put(`brand/logo/${await hashOf(j)}.png`, j)).status).toBe(415);
  });
});

describe("siapa yang boleh mengunggah", () => {
  const photoKey = async () => {
    const photo = jpeg(9);
    return { photo, key: productImageKey("as002", await hashOf(photo)) };
  };

  it("tanpa token, token rusak, atau tanda tangan kunci lain: 401", async () => {
    const { photo, key } = await photoKey();
    expect((await put(key, photo, { token: null })).status).toBe(401);
    expect((await put(key, photo, { token: "a.b.c" })).status).toBe(401);
    const otherKeys = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const res = await put(key, photo, { deps: deps({ signingKeys: async () => new Map([["k1", otherKeys.publicKey]]) }) });
    expect(res.status).toBe(401);
  });

  it("token kedaluwarsa atau iss tidak cocok: 401", async () => {
    const { photo, key } = await photoKey();
    expect((await put(key, photo, { token: await sign(claims({ exp: NOW - 1 })) })).status).toBe(401);
    expect((await put(key, photo, { token: await sign(claims({ iss: "https://securetoken.google.com/lain" })) })).status).toBe(401);
  });

  it("token alg none hanya diterima saat ACCEPT_EMULATOR_TOKENS", async () => {
    const { photo, key } = await photoKey();
    const none = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(claims()))}.`;
    expect((await put(key, photo, { token: none })).status).toBe(401);
    expect((await put(key, photo, { token: none, env: env({ ACCEPT_EMULATOR_TOKENS: "true" }) })).status).toBe(201);
  });

  it("project lain (aud tidak dikenal): 403", async () => {
    const { photo, key } = await photoKey();
    const other = await sign(claims({ aud: "haoshii-dimsum", iss: "https://securetoken.google.com/haoshii-dimsum" }));
    expect((await put(key, photo, { token: other })).status).toBe(403);
  });

  it("staf atau admin tanpa peran: 403", async () => {
    const { photo, key } = await photoKey();
    expect((await put(key, photo, { token: await sign(claims({ role: "staff", branchId: "a" })) })).status).toBe(403);
    expect((await put(key, photo, { token: await sign(claims({ role: undefined })) })).status).toBe(403);
    expect((await put(key, photo, { token: await sign(claims({ admin: false })) })).status).toBe(403);
  });

  it("origin asing: 403 tanpa header CORS", async () => {
    const { photo, key } = await photoKey();
    const res = await put(key, photo, { origin: "https://jahat.example" });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rate limiter menolak: 429", async () => {
    const { photo, key } = await photoKey();
    const res = await put(key, photo, { env: env({ UPLOAD_LIMITER: { limit: async () => ({ success: false }) } }) });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("rate_limited");
  });

  it("batas harian per klien: 429 daily_limit", async () => {
    for (let i = 0; i < 5; i++) {
      const p = jpeg(10 + i);
      expect((await put(productImageKey("as002", await hashOf(p)), p)).status).toBe(201);
    }
    const p = jpeg(99);
    const res = await put(productImageKey("as002", await hashOf(p)), p);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("daily_limit");
  });

  it("binding bucket tidak ada: 500, bukan menulis ke tempat lain", async () => {
    const { photo, key } = await photoKey();
    const res = await put(key, photo, { env: env({ BUCKET_KASIR_DEMO: undefined }) });
    expect(res.status).toBe(500);
  });
});

describe("GET publik", () => {
  it("melayani gambar dengan cache immutable dan CORS terbuka", async () => {
    const photo = jpeg();
    const key = productImageKey("as002", await hashOf(photo));
    await bucket.put(key, photo);
    const res = await handle(new Request(`https://media.example/v1/kasir-demo/${key}`), env(), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(photo);
  });

  it("dari cache edge bila ada, tanpa membaca bucket", async () => {
    const stored = new Map<string, Response>();
    const cache: CacheLike = {
      match: async (r) => stored.get(r.url)?.clone(),
      put: async (r, res) => void stored.set(r.url, res),
    };
    const photo = jpeg();
    const key = productImageKey("as002", await hashOf(photo));
    await bucket.put(key, photo);
    const url = `https://media.example/v1/kasir-demo/${key}`;
    await handle(new Request(url), env(), deps({ cache }));
    bucket.store.clear();
    const res = await handle(new Request(url), env(), deps({ cache }));
    expect(res.status).toBe(200);
  });

  it("key, slug, atau objek tidak dikenal: 404 tanpa cache", async () => {
    const res1 = await handle(new Request("https://media.example/v1/kasir-demo/_usage/2026-11-25.json"), env(), deps());
    expect(res1.status).toBe(404);
    const res2 = await handle(new Request(`https://media.example/v1/lain/${productImageKey("a", "0123456789abcdef")}`), env(), deps());
    expect(res2.status).toBe(404);
    const res3 = await handle(new Request(`https://media.example/v1/kasir-demo/${productImageKey("a", "0123456789abcdef")}`), env(), deps());
    expect(res3.status).toBe(404);
    expect(res3.headers.get("cache-control")).toBe("no-store");
  });
});

describe("parseClients", () => {
  it("entri rusak diabaikan, batas harian punya default", () => {
    const parsed = parseClients(
      JSON.stringify({
        ok: { slug: "toko-a", bucket: "B", origins: ["https://a"] },
        badSlug: { slug: "Toko A", bucket: "B" },
        noBucket: { slug: "toko-b" },
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].maxUploadsPerDay).toBe(500);
    expect(parseClients("bukan json")).toEqual([]);
  });
});
