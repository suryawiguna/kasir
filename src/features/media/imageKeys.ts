/**
 * Nama file gambar di R2: satu-satunya tempat pola key didefinisikan. Dipakai
 * aplikasi (membuat key dan URL) **dan** Worker `kasir-media` (memeriksa
 * unggahan), jadi keduanya tidak bisa berbeda pendapat. firestore.rules
 * memakai regex yang sama; ubah di sana juga bila pola di sini berubah.
 *
 * Nama berdasarkan isi: `<hash>` = 16 karakter hex pertama SHA-256 isi file.
 * Satu nama = satu isi selamanya, jadi cache boleh `immutable` dan unggah
 * ulang aman.
 *
 *   products/<productId>/<hash>.jpg     foto produk (≤1024px)
 *   products/<productId>/<hash>-t.jpg   thumbnail persegi (256px)
 *   brand/logo/<hash>.jpg|png           logo toko
 *
 * Modul murni: tanpa DOM, tanpa Firebase, tanpa `src/client.ts`.
 */

export const HASH_LENGTH = 16;

const HASH = `[0-9a-f]{${HASH_LENGTH}}`;
/** Sama dengan id dokumen Firestore yang dibuat aplikasi, tanpa titik dan garis miring. */
const PRODUCT_ID = "[A-Za-z0-9_-]{1,100}";

const PRODUCT_IMAGE = new RegExp(`^products/(${PRODUCT_ID})/(${HASH})\\.jpg$`);
const PRODUCT_THUMB = new RegExp(`^products/(${PRODUCT_ID})/(${HASH})-t\\.jpg$`);
const LOGO = new RegExp(`^brand/logo/(${HASH})\\.(jpg|png)$`);
const PRODUCT_ID_ONLY = new RegExp(`^${PRODUCT_ID}$`);

export type ImageExt = "jpg" | "png";
export type ImageKind = "product" | "thumb" | "logo";

export interface ParsedImageKey {
  kind: ImageKind;
  hash: string;
  ext: ImageExt;
  productId?: string;
}

/** Batas ukuran per jenis, dalam byte. Worker menolak yang lebih besar. */
export const MAX_BYTES: Record<ImageKind, number> = {
  product: 300 * 1024,
  thumb: 60 * 1024,
  logo: 200 * 1024,
};

export const isValidProductId = (id: string): boolean => PRODUCT_ID_ONLY.test(id);

export const parseImageKey = (key: string): ParsedImageKey | null => {
  let m = PRODUCT_THUMB.exec(key);
  if (m) return { kind: "thumb", productId: m[1], hash: m[2], ext: "jpg" };
  m = PRODUCT_IMAGE.exec(key);
  if (m) return { kind: "product", productId: m[1], hash: m[2], ext: "jpg" };
  m = LOGO.exec(key);
  if (m) return { kind: "logo", hash: m[1], ext: m[2] as ImageExt };
  return null;
};

/** Key foto produk (bukan thumbnail), untuk disimpan di `products/{id}.image`. */
export const isProductImageKeyFor = (key: string, productId: string): boolean => {
  const parsed = parseImageKey(key);
  return parsed?.kind === "product" && parsed.productId === productId;
};

export const isLogoKey = (key: string): boolean => parseImageKey(key)?.kind === "logo";

const assertHash = (hash: string) => {
  if (!new RegExp(`^${HASH}$`).test(hash)) throw new Error(`Hash gambar tidak valid: ${hash}`);
};

export const productImageKey = (productId: string, hash: string): string => {
  if (!isValidProductId(productId)) throw new Error(`Id produk tidak valid untuk nama file: ${productId}`);
  assertHash(hash);
  return `products/${productId}/${hash}.jpg`;
};

/** Thumbnail selalu bernama sama dengan fotonya, ditambah `-t`. */
export const thumbKeyOf = (productImage: string): string | null => {
  const parsed = parseImageKey(productImage);
  if (parsed?.kind !== "product") return null;
  return `products/${parsed.productId}/${parsed.hash}-t.jpg`;
};

/** Key foto utama dari key thumbnail (Worker memeriksa fotonya sudah ada). */
export const originalKeyOfThumb = (thumb: string): string | null => {
  const parsed = parseImageKey(thumb);
  if (parsed?.kind !== "thumb") return null;
  return `products/${parsed.productId}/${parsed.hash}.jpg`;
};

export const logoKey = (hash: string, ext: ImageExt): string => {
  assertHash(hash);
  return `brand/logo/${hash}.${ext}`;
};

export const CONTENT_TYPE: Record<ImageExt, string> = {
  jpg: "image/jpeg",
  png: "image/png",
};

/** URL publik gambar lewat Worker. `null` bila Worker belum dipasang untuk klien ini. */
export const imageUrl = (workerUrl: string, slug: string, key: string): string | null => {
  if (!workerUrl || !parseImageKey(key)) return null;
  return `${workerUrl.replace(/\/+$/, "")}/v1/${encodeURIComponent(slug)}/${key}`;
};

/** Hex dari 16 karakter pertama digest SHA-256. */
export const hashFromDigest = (digest: ArrayBuffer): string =>
  Array.from(new Uint8Array(digest).slice(0, HASH_LENGTH / 2), (b) => b.toString(16).padStart(2, "0")).join("");

/** Isi file benar-benar JPEG/PNG (magic bytes), bukan hanya bernama begitu. */
export const matchesMagicBytes = (bytes: Uint8Array, ext: ImageExt): boolean => {
  if (ext === "jpg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
};
