/**
 * Fitur yang dinyalakan/dimatikan pemilik dari Pengaturan → Fitur, disimpan di
 * satu dokumen `settings/features`. Mematikan fitur menyembunyikannya dan
 * menghentikan aksinya, **tanpa menghapus data** yang sudah tercatat.
 *
 * Tidak ada saklar "banyak cabang": pemilih dan label cabang muncul sendiri
 * begitu toko punya lebih dari satu cabang (Pengaturan → Cabang). Dokumen
 * lama yang masih berisi `multiBranch` tetap diterima rules dan diabaikan.
 */
export type FeatureName =
  | "receipt"
  | "weightSales"
  | "bundles"
  | "preorder"
  | "customers"
  | "transfer"
  | "qris"
  | "kitchenTicket"
  | "events"
  | "cashCount"
  | "proofPhotos";

export type FeatureFlags = Record<FeatureName, boolean>;

/** Nilai untuk toko tanpa dokumen `settings/features`. */
export const DEFAULT_FEATURES: FeatureFlags = {
  receipt: false,
  weightSales: false,
  bundles: true,
  preorder: true,
  customers: true,
  transfer: true,
  qris: false,
  kitchenTicket: false,
  events: false,
  cashCount: false,
  proofPhotos: false,
};

export const FEATURE_ORDER: readonly FeatureName[] = [
  "receipt",
  "weightSales",
  "bundles",
  "preorder",
  "customers",
  "transfer",
  "qris",
  "kitchenTicket",
  "events",
  "cashCount",
  "proofPhotos",
];

/**
 * `ready: false` = belum dibangun. Fitur itu tidak ditampilkan di Pengaturan
 * sama sekali (saklar mati tanpa alasan membingungkan pemilik), dan muncul
 * sendiri begitu `ready` dibalik.
 */
export const FEATURE_INFO: Record<FeatureName, { label: string; detail: string; ready: boolean }> = {
  receipt: { label: "Cetak struk", detail: "Struk pelanggan lewat printer thermal Bluetooth atau browser.", ready: true },
  weightSales: { label: "Jual per berat", detail: "Kasir mengetik berat untuk produk per kg/liter.", ready: true },
  bundles: { label: "Paket dan pilihan", detail: "Produk paket dan grup pilihan saat jual.", ready: true },
  preorder: { label: "Bayar nanti", detail: "Simpan pesanan yang dibayar saat diambil.", ready: true },
  customers: { label: "Nama pelanggan", detail: "Nama dan No. HP pelanggan di pesanan.", ready: true },
  transfer: { label: "Transfer", detail: "Transfer bank sebagai metode bayar.", ready: true },
  qris: { label: "QRIS", detail: "QRIS sebagai metode bayar.", ready: true },
  kitchenTicket: { label: "Struk dapur", detail: "Cetak tiket dapur tanpa harga, dari pratinjau struk.", ready: true },
  events: { label: "Event", detail: "Tandai pesanan dengan event, mis. bazar.", ready: false },
  cashCount: { label: "Hitung kas", detail: "Hitung uang di laci tiap tutup.", ready: false },
  proofPhotos: { label: "Foto bukti transfer", detail: "Foto bukti saat bayar transfer atau QRIS.", ready: false },
};

/** Setiap flag jatuh ke default bila tidak ada atau bukan boolean. */
export const parseFeatures = (data: unknown): FeatureFlags => {
  const stored = (data !== null && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const flags = { ...DEFAULT_FEATURES };
  for (const name of FEATURE_ORDER) {
    if (typeof stored[name] === "boolean") flags[name] = stored[name] as boolean;
  }
  return flags;
};
