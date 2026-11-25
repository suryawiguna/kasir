import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { MediaError, prepareLogo, prepareProductImage } from "../features/media/compressImage";
import { logoKey, productImageKey, thumbKeyOf } from "../features/media/imageKeys";
import { uploadImage, uploadsEnabled, UploadError } from "../features/media/uploadImage";
import { useOnline } from "../features/ui/useOnline";
import { cn } from "../lib/cn";
import { ProductImage } from "./ProductImage";
import { ShopLogo } from "./ShopLogo";

/**
 * Pilih, kompres, dan unggah foto produk atau logo. Hasilnya hanya key R2
 * lewat `onChange`; menyimpan ke Firestore tetap urusan tombol Simpan di
 * editor (lewat queueWrite), sama seperti field lain.
 *
 * Foto produk: foto utama diunggah dulu, lalu thumbnail (Worker menolak
 * thumbnail tanpa foto utamanya). Keduanya harus berhasil sebelum key dipakai.
 */
type Target = { kind: "product"; productId: string } | { kind: "logo" };

export function ImagePicker({
  target,
  value,
  onChange,
  name,
}: {
  target: Target;
  value?: string;
  onChange: (key: string | undefined) => void;
  name: string;
}) {
  const { user } = useAuth();
  const online = useOnline();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"processing" | "uploading" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pratinjau lokal hasil kompresi, supaya foto baru tampil tanpa menunggu unduhan.
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  if (!uploadsEnabled()) {
    return <p className="field-hint">Unggah foto belum aktif untuk toko ini.</p>;
  }

  const getToken = () => {
    if (!user) return Promise.reject(new Error("no user"));
    return user.getIdToken();
  };

  const pick = async (file: File) => {
    setError(null);
    setBusy("processing");
    try {
      let key: string;
      let shown: Blob;
      if (target.kind === "product") {
        const { photo, thumb } = await prepareProductImage(file);
        key = productImageKey(target.productId, photo.hash);
        setBusy("uploading");
        await uploadImage(key, photo.blob, getToken);
        await uploadImage(thumbKeyOf(key)!, thumb.blob, getToken);
        shown = thumb.blob;
      } else {
        const logo = await prepareLogo(file);
        key = logoKey(logo.hash, logo.ext);
        setBusy("uploading");
        await uploadImage(key, logo.blob, getToken);
        shown = logo.blob;
      }
      setPreview({ key, url: URL.createObjectURL(shown) });
      onChange(key);
    } catch (e) {
      setError(e instanceof MediaError || e instanceof UploadError ? e.message : "Gagal memproses foto. Coba foto lain.");
    } finally {
      setBusy(null);
    }
  };

  const round = target.kind === "logo";
  const localUrl = preview && preview.key === value ? preview.url : null;
  const disabled = Boolean(busy) || !online;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className={cn("relative h-20 w-20 shrink-0 overflow-hidden bg-zinc-100", round ? "rounded-full" : "rounded-xl")}>
          {localUrl ? (
            <img src={localUrl} alt="" className="h-full w-full object-cover" />
          ) : value ? (
            round ? (
              <ShopLogo logo={value} name={name || "?"} className="h-20 w-20 text-3xl" />
            ) : (
              <ProductImage imageKey={value} name={name || "?"} className="h-20 w-20 rounded-xl" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400">
              <ImagePlus size={24} />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 size={22} className="animate-spin text-zinc-600" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={disabled} onClick={() => input.current?.click()}>
            <ImagePlus size={14} /> {value ? "Ganti foto" : "Pilih foto"}
          </button>
          {value && (
            <button
              type="button"
              className="btn-danger-quiet btn-sm"
              disabled={Boolean(busy)}
              onClick={() => {
                setError(null);
                onChange(undefined);
              }}
            >
              <Trash2 size={14} /> Hapus
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pick(file);
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="field-error">{error}</p>
      ) : busy ? (
        <p className="field-hint">{busy === "processing" ? "Memproses foto…" : "Mengunggah…"}</p>
      ) : !online ? (
        <p className="field-hint">Butuh internet untuk mengunggah foto.</p>
      ) : null}
    </div>
  );
}
