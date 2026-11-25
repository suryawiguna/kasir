/**
 * Titik masuk Cloudflare. Semua logika ada di handler.ts (dites di Node);
 * di sini hanya binding Cloudflare yang disambungkan: kunci Google, jam,
 * cache edge, dan waitUntil.
 */
import { handle, type CacheLike, type Env } from "./handler";
import { googleSigningKeys } from "./token";

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const edgeCache = (caches as unknown as { default?: CacheLike }).default;
    return handle(request, env, {
      signingKeys: googleSigningKeys,
      now: Date.now,
      cache: edgeCache,
      waitUntil: (p) => ctx.waitUntil(p),
    });
  },
};
