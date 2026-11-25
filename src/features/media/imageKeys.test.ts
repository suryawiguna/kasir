import { describe, expect, it } from "vitest";
import {
  hashFromDigest,
  imageUrl,
  isLogoKey,
  isProductImageKeyFor,
  logoKey,
  matchesMagicBytes,
  originalKeyOfThumb,
  parseImageKey,
  productImageKey,
  thumbKeyOf,
} from "./imageKeys";

const H = "3f9a1c0b7d2e4a55";

describe("key gambar", () => {
  it("foto produk, thumbnail, dan logo bolak-balik", () => {
    const key = productImageKey("as002", H);
    expect(key).toBe(`products/as002/${H}.jpg`);
    expect(parseImageKey(key)).toEqual({ kind: "product", productId: "as002", hash: H, ext: "jpg" });
    const thumb = thumbKeyOf(key)!;
    expect(thumb).toBe(`products/as002/${H}-t.jpg`);
    expect(parseImageKey(thumb)?.kind).toBe("thumb");
    expect(originalKeyOfThumb(thumb)).toBe(key);
    expect(logoKey(H, "png")).toBe(`brand/logo/${H}.png`);
    expect(isLogoKey(logoKey(H, "jpg"))).toBe(true);
  });

  it("foto hanya sah untuk produknya sendiri", () => {
    const key = productImageKey("as002", H);
    expect(isProductImageKeyFor(key, "as002")).toBe(true);
    expect(isProductImageKeyFor(key, "as003")).toBe(false);
    expect(isProductImageKeyFor(thumbKeyOf(key)!, "as002")).toBe(false);
  });

  it("menolak path traversal, hash salah, ekstensi lain, dan URL", () => {
    for (const bad of [
      `products/../${H}.jpg`,
      `products/a/b/${H}.jpg`,
      `products/a/${H.toUpperCase()}.jpg`,
      `products/a/${H.slice(1)}.jpg`,
      `products/a/${H}.png`,
      `brand/logo/${H}.gif`,
      `https://example.com/${H}.jpg`,
      "",
    ]) {
      expect(parseImageKey(bad), bad).toBeNull();
    }
    expect(() => productImageKey("a/b", H)).toThrow();
    expect(() => productImageKey("a", "xyz")).toThrow();
    expect(thumbKeyOf(logoKey(H, "png"))).toBeNull();
  });

  it("URL dari workerUrl dan slug; kosong bila Worker belum dipasang", () => {
    expect(imageUrl("https://media.example/", "kasir-demo", productImageKey("as002", H))).toBe(
      `https://media.example/v1/kasir-demo/products/as002/${H}.jpg`,
    );
    expect(imageUrl("", "kasir-demo", productImageKey("as002", H))).toBeNull();
    expect(imageUrl("https://media.example", "kasir-demo", "https://jahat.example/x.jpg")).toBeNull();
  });

  it("hash = 16 hex pertama digest", () => {
    const digest = new Uint8Array(32).map((_, i) => i * 17).buffer;
    expect(hashFromDigest(digest)).toBe("0011223344556677");
  });

  it("magic bytes JPEG dan PNG", () => {
    expect(matchesMagicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "jpg")).toBe(true);
    expect(matchesMagicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "png")).toBe(false);
    expect(matchesMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "png")).toBe(true);
    expect(matchesMagicBytes(new Uint8Array([1, 2, 3, 4]), "jpg")).toBe(false);
  });
});
