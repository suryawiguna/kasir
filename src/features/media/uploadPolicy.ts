/**
 * Jawaban Worker `kasir-media` → apa yang dilakukan aplikasi: coba lagi atau
 * berhenti, dan kalimat untuk pemilik. Kode galat dibuat oleh
 * worker/src/handler.ts. Modul murni.
 */

export interface UploadFailure {
  /** 0 = tidak ada jawaban (jaringan, batas waktu). */
  status: number;
  code?: string;
}

/** Hanya galat sementara yang dicoba lagi; 4xx berarti mengirim ulang pun sama hasilnya. */
export const isRetryable = ({ status }: UploadFailure): boolean => status === 0 || status >= 500;

export const MAX_ATTEMPTS = 3;
export const TIMEOUT_MS = 20_000;

/** Jeda sebelum percobaan ke-n (mulai 1): 1 detik, lalu 3 detik. */
export const retryDelayMs = (attempt: number): number => (attempt <= 1 ? 1000 : 3000);

export const describeUploadFailure = ({ status, code }: UploadFailure): string => {
  if (status === 0) return "Gagal mengunggah. Periksa internet lalu coba lagi.";
  if (status === 401) return "Sesi berakhir. Masuk lagi lalu coba lagi.";
  if (status === 403) {
    if (code === "owner_only") return "Hanya pemilik yang bisa mengunggah foto.";
    return "Unggahan ditolak untuk toko ini. Hubungi admin.";
  }
  if (status === 413) return "Foto masih terlalu besar setelah dikompres. Pilih foto lain.";
  if (status === 415) return "Format foto tidak didukung. Pilih JPG atau PNG.";
  if (status === 422) return "Foto rusak saat dikirim. Coba lagi.";
  if (status === 429) {
    if (code === "daily_limit") return "Batas unggahan harian toko ini tercapai. Coba lagi besok.";
    return "Terlalu banyak unggahan. Tunggu sebentar lalu coba lagi.";
  }
  if (status >= 500) return "Server foto sedang bermasalah. Coba lagi nanti.";
  return `Gagal mengunggah (kode ${status}).`;
};
