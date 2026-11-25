import { hashFromDigest, MAX_BYTES, type ImageExt } from "./imageKeys";
import {
  centerSquare,
  checkSourceFile,
  checkSourceSize,
  fitWithin,
  JPEG_QUALITIES,
  LOGO_MAX_SIDE,
  PRODUCT_MAX_SIDE,
  THUMB_SIDE,
  type Rect,
  type Size,
} from "./imageSize";

/**
 * Foto dari kamera/galeri → JPEG/PNG kecil siap unggah, plus hash isinya
 * untuk nama file. Butuh DOM (canvas), jadi tidak dites otomatis; aturan
 * ukurannya ada di imageSize.ts dan dites di sana.
 */

export class MediaError extends Error {}

export interface PreparedImage {
  blob: Blob;
  hash: string;
  ext: ImageExt;
  size: Size;
}

type Source = ImageBitmap | HTMLImageElement;

const sourceSize = (s: Source): Size =>
  "naturalWidth" in s ? { width: s.naturalWidth, height: s.naturalHeight } : { width: s.width, height: s.height };

/** Dekode dengan orientasi EXIF diterapkan (foto HP tidak miring). */
const decode = async (file: File): Promise<Source> => {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Safari lama: <img> menerapkan orientasi EXIF sendiri.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new MediaError("Foto ini tidak bisa dibaca. Pilih JPG atau PNG.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
};

const canvasOf = (size: Size): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
};

/**
 * Gambar `crop` dari sumber ke ukuran `target`. Diperkecil bertahap (paling
 * banyak setengah per langkah) supaya hasilnya tidak bergerigi.
 */
const draw = (source: Source, crop: Rect, target: Size, opaque: boolean): HTMLCanvasElement => {
  let current: CanvasImageSource = source;
  let currentRect: Rect = crop;
  while (currentRect.width / 2 >= target.width && currentRect.height / 2 >= target.height) {
    const half = { width: Math.round(currentRect.width / 2), height: Math.round(currentRect.height / 2) };
    const step = canvasOf(half);
    const ctx = step.getContext("2d");
    if (!ctx) throw new MediaError("Perangkat ini tidak bisa memproses foto.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, currentRect.x, currentRect.y, currentRect.width, currentRect.height, 0, 0, half.width, half.height);
    current = step;
    currentRect = { x: 0, y: 0, ...half };
  }
  const out = canvasOf(target);
  const ctx = out.getContext("2d");
  if (!ctx) throw new MediaError("Perangkat ini tidak bisa memproses foto.");
  if (opaque) {
    // JPEG tidak punya transparansi: tanpa ini area transparan jadi hitam.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.width, target.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, currentRect.x, currentRect.y, currentRect.width, currentRect.height, 0, 0, target.width, target.height);
  return out;
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaError("Gagal memproses foto."))), type, quality),
  );

const hashOf = async (blob: Blob): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new MediaError("Unggah foto butuh koneksi aman (https). Buka aplikasi dari alamat resminya.");
  }
  return hashFromDigest(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
};

/** Kodekan sampai muat `maxBytes`: turunkan kualitas JPEG, lalu ukuran. */
const encode = async (
  source: Source,
  crop: Rect,
  target: Size,
  ext: ImageExt,
  maxBytes: number,
): Promise<PreparedImage> => {
  let size = target;
  for (let shrink = 0; shrink < 4; shrink++) {
    const canvas = draw(source, crop, size, ext === "jpg");
    const qualities = ext === "jpg" ? JPEG_QUALITIES : [undefined];
    for (const q of qualities) {
      const blob = await toBlob(canvas, ext === "jpg" ? "image/jpeg" : "image/png", q);
      if (blob.size <= maxBytes) return { blob, hash: await hashOf(blob), ext, size };
    }
    size = { width: Math.max(1, Math.round(size.width * 0.8)), height: Math.max(1, Math.round(size.height * 0.8)) };
  }
  throw new MediaError("Foto ini tidak bisa diperkecil cukup jauh. Pilih foto lain.");
};

const load = async (file: File): Promise<{ source: Source; size: Size }> => {
  const fileProblem = checkSourceFile(file);
  if (fileProblem) throw new MediaError(fileProblem);
  const source = await decode(file);
  const size = sourceSize(source);
  const sizeProblem = checkSourceSize(size);
  if (sizeProblem) throw new MediaError(sizeProblem);
  return { source, size };
};

const close = (source: Source) => {
  if ("close" in source) source.close();
};

export const prepareProductImage = async (file: File): Promise<{ photo: PreparedImage; thumb: PreparedImage }> => {
  const { source, size } = await load(file);
  try {
    const full: Rect = { x: 0, y: 0, ...size };
    const photo = await encode(source, full, fitWithin(size, PRODUCT_MAX_SIDE), "jpg", MAX_BYTES.product);
    const square = centerSquare(size);
    const thumbSide = Math.min(THUMB_SIDE, square.width);
    const thumb = await encode(source, square, { width: thumbSide, height: thumbSide }, "jpg", MAX_BYTES.thumb);
    return { photo, thumb };
  } finally {
    close(source);
  }
};

/** Ada piksel transparan? Dicek di salinan kecil supaya cepat. */
const hasTransparency = (source: Source, size: Size): boolean => {
  const probe = fitWithin(size, 64);
  const canvas = canvasOf(probe);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(source, 0, 0, probe.width, probe.height);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
};

/** Logo: PNG bila ada transparansi (logo di atas warna), selain itu JPEG. */
export const prepareLogo = async (file: File): Promise<PreparedImage> => {
  const { source, size } = await load(file);
  try {
    const ext: ImageExt = hasTransparency(source, size) ? "png" : "jpg";
    return await encode(source, { x: 0, y: 0, ...size }, fitWithin(size, LOGO_MAX_SIDE), ext, MAX_BYTES.logo);
  } finally {
    close(source);
  }
};
