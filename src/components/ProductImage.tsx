import { useState } from "react";
import { thumbKeyOf } from "../features/media/imageKeys";
import { mediaUrl } from "../features/media/uploadImage";
import { cn } from "../lib/cn";

/**
 * Foto produk dari key R2 (`products/{id}.image`). `thumb` memakai thumbnail
 * persegi 256px, untuk daftar. Tanpa foto → tidak merender apa pun; foto yang
 * gagal dimuat → kotak huruf awal dengan ukuran sama, supaya baris tidak
 * melompat dan tidak ada ikon gambar rusak.
 *
 * Halaman tidak memakai `<img>` langsung untuk foto produk (dicek
 * scripts/check-paths.mjs), jadi aturan cache dan cadangan ada di sini saja.
 */
export function ProductImage({
  imageKey,
  name,
  variant = "thumb",
  className = "h-14 w-14 rounded-xl",
}: {
  imageKey?: string;
  name: string;
  variant?: "thumb" | "full";
  className?: string;
}) {
  const key = imageKey && variant === "thumb" ? thumbKeyOf(imageKey) ?? undefined : imageKey;
  const src = mediaUrl(key);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src) return null;
  if (failed === src) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center bg-zinc-100 font-bold text-zinc-400", className)} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      onError={() => setFailed(src)}
      className={cn("shrink-0 bg-zinc-100 object-cover", className)}
    />
  );
}
