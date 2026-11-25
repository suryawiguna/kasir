import { useState } from "react";
import { mediaUrl } from "../features/media/uploadImage";
import { cn } from "../lib/cn";

/**
 * Logo toko, atau huruf awal nama di lingkaran warna brand. `logo` = key R2
 * dari unggahan; `legacyUrl` = `logoUrl` lama yang diketik sebelum unggah ada.
 * Gagal dimuat (offline belum di-cache, objek sudah dihapus) → huruf awal.
 */
export function ShopLogo({
  logo,
  legacyUrl,
  name,
  className = "h-16 w-16 text-2xl",
}: {
  logo?: string;
  legacyUrl?: string;
  name: string;
  className?: string;
}) {
  const src = mediaUrl(logo) ?? legacyUrl ?? null;
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt=""
        crossOrigin={logo ? "anonymous" : undefined}
        onError={() => setFailed(src)}
        className={cn("shrink-0 rounded-full bg-white object-cover", className)}
      />
    );
  }
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-brand-500 font-bold text-brand-fg", className)}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
