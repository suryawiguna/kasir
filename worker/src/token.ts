/**
 * Verifikasi Firebase ID token tanpa dependency (port dari Worker Haoshii):
 * tanda tangan RS256 terhadap kunci publik Google lewat WebCrypto, lalu
 * pemeriksaan klaim `aud`, `iss`, `sub`, `exp`, `iat`.
 *
 * `aud` tidak dicek terhadap satu project, tetapi dikembalikan: handler yang
 * mencocokkannya dengan peta klien, karena satu Worker melayani banyak klien
 * (satu project Firebase per klien).
 */

export interface Claims {
  aud: string;
  iss: string;
  sub: string;
  exp: number;
  iat: number;
  email?: string;
  admin?: boolean;
  role?: string;
  branchId?: string;
}

export type SigningKeys = () => Promise<Map<string, CryptoKey>>;

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache: { keys: Map<string, CryptoKey>; expires: number } | null = null;

/** Kunci tanda tangan Google, di-cache selama Cache-Control mengizinkan. */
export const googleSigningKeys: SigningKeys = async () => {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`JWKS ${response.status}`);
  const { keys } = (await response.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const imported = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    imported.set(
      jwk.kid,
      await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]),
    );
  }
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  jwksCache = { keys: imported, expires: Date.now() + maxAge * 1000 };
  return imported;
};

export const base64UrlDecode = (part: string): Uint8Array => {
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const decodeJson = <T>(part: string): T => JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T;

export interface VerifyOptions {
  signingKeys: SigningKeys;
  /** Detik sejak epoch. */
  now: number;
  /**
   * Hanya untuk `wrangler dev` dengan Auth emulator, yang tokennya
   * `alg: none` tanpa tanda tangan. Tidak pernah aktif di Worker yang di-deploy.
   */
  acceptEmulatorTokens: boolean;
}

/** Klaim token bila tanda tangan dan waktunya valid, selain itu null. */
export const verifyIdToken = async (token: string, opts: VerifyOptions): Promise<Claims | null> => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let claims: Claims;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    return null;
  }

  if (!(opts.acceptEmulatorTokens && header.alg === "none")) {
    if (header.alg !== "RS256" || !header.kid) return null;
    const key = (await opts.signingKeys()).get(header.kid);
    if (!key) return null;
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
  }

  if (typeof claims.aud !== "string" || !claims.aud) return null;
  if (claims.iss !== `https://securetoken.google.com/${claims.aud}`) return null;
  if (!claims.sub || typeof claims.exp !== "number" || claims.exp <= opts.now) return null;
  if (typeof claims.iat !== "number" || claims.iat > opts.now + 300) return null;
  return claims;
};

/** Sama dengan `isOwner()` di firestore.rules. */
export const isOwner = (claims: Claims): boolean => claims.admin === true && claims.role === "owner";
