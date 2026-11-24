import { toast } from "sonner";

/**
 * **Jangan pernah `await` write Firestore.** Promise write baru selesai saat
 * *server* mengakui, jadi offline ia tidak pernah selesai: spinner berputar
 * selamanya padahal data di cache lokal sudah benar dan listener sudah
 * menampilkannya. Serahkan setiap write ke sini dan anggap selesai; penolakan
 * yang terlambat muncul sebagai toast.
 */
export const queueWrite = (write: Promise<unknown>, what: string, onReject?: (message: string) => void) => {
  void write.catch((error: unknown) => {
    const message = `${what} gagal disimpan: ${describeWriteError(error)}`;
    if (import.meta.env.DEV) console.error(what, error);
    toast.error(message, { duration: 10000 });
    onReject?.(message);
  });
};

/** Pesan galat Firestore dalam kata-kata yang bisa ditindaklanjuti kasir. */
export const describeWriteError = (error: unknown): string => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  switch (code) {
    case "permission-denied":
      return "akun ini tidak punya izin untuk perubahan ini. Hubungi pemilik.";
    case "unauthenticated":
      return "sesi berakhir. Masuk lagi.";
    case "resource-exhausted":
      return "kuota database hari ini habis. Coba lagi besok atau hubungi admin.";
    case "invalid-argument":
      return "data tidak valid.";
    case "not-found":
      return "data tidak ditemukan (mungkin sudah dihapus di perangkat lain).";
    default:
      return error instanceof Error ? error.message : "kesalahan tidak dikenal.";
  }
};
