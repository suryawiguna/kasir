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
  | "stockTracking"
  | "weightSales"
  | "bundles"
  | "freeItems"
  | "branchPricing"
  | "sku"
  | "preorder"
  | "customers"
  | "transfer"
  | "qris"
  | "kitchenTicket"
  | "events"
  | "cashCount"
  | "proofPhotos"
  | "productPhotos";

export type FeatureFlags = Record<FeatureName, boolean>;

/** Nilai untuk toko tanpa dokumen `settings/features`. */
export const DEFAULT_FEATURES: FeatureFlags = {
  receipt: false,
  stockTracking: true,
  weightSales: false,
  bundles: true,
  freeItems: false,
  branchPricing: false,
  sku: false,
  preorder: true,
  customers: true,
  transfer: true,
  qris: false,
  kitchenTicket: false,
  events: false,
  cashCount: false,
  proofPhotos: false,
  productPhotos: true,
};

export const FEATURE_ORDER: readonly FeatureName[] = [
  "stockTracking",
  "weightSales",
  "bundles",
  "freeItems",
  "branchPricing",
  "sku",
  "productPhotos",
  "receipt",
  "preorder",
  "customers",
  "transfer",
  "qris",
  "kitchenTicket",
  "events",
  "cashCount",
  "proofPhotos",
];

/** Kelompok di Pengaturan → Fitur. "product" = bagian form produk dan cara kasir memakainya. */
export type FeatureGroup = "product" | "sales";

export const FEATURE_GROUPS: readonly { group: FeatureGroup; title: string; intro: string }[] = [
  {
    group: "product",
    title: "Produk",
    intro: "Bagian form produk yang dipakai toko ini. Yang dimatikan hilang dari form dan tidak berlaku di kasir.",
  },
  { group: "sales", title: "Kasir dan pembayaran", intro: "Mematikan fitur menyembunyikannya dari semua perangkat." },
];

/**
 * `ready: false` = belum dibangun. Fitur itu tidak ditampilkan di Pengaturan
 * sama sekali (saklar mati tanpa alasan membingungkan pemilik), dan muncul
 * sendiri begitu `ready` dibalik. `multiBranchOnly`: hanya bermakna bila toko
 * punya lebih dari satu cabang.
 */
export const FEATURE_INFO: Record<
  FeatureName,
  { label: string; detail: string; ready: boolean; group: FeatureGroup; multiBranchOnly?: boolean }
> = {
  stockTracking: {
    label: "Hitung stok",
    detail: "Produk memotong stok saat terjual, dengan tab Stok. Matikan untuk toko yang tidak mencatat stok.",
    ready: true,
    group: "product",
  },
  weightSales: { label: "Jual per berat", detail: "Produk per kg/liter; kasir mengetik beratnya.", ready: true, group: "product" },
  bundles: {
    label: "Paket dan pilihan",
    detail: "Grup pilihan saat jual: isi paket, varian, ukuran, level pedas.",
    ready: true,
    group: "product",
  },
  freeItems: { label: "Bonus gratis", detail: "Produk lain yang ikut gratis setiap produk ini terjual.", ready: true, group: "product" },
  branchPricing: {
    label: "Harga per cabang",
    detail: "Harga berbeda di tiap cabang. Mati: semua cabang memakai harga dasar.",
    ready: true,
    group: "product",
    multiBranchOnly: true,
  },
  sku: { label: "SKU", detail: "Kode produk, ikut tercatat di pesanan.", ready: true, group: "product" },
  productPhotos: {
    label: "Foto produk di kasir",
    detail: "Tampilkan foto produk di daftar kasir. Matikan untuk daftar yang lebih rapat.",
    ready: true,
    group: "product",
  },
  receipt: { label: "Cetak struk", detail: "Struk pelanggan lewat printer thermal Bluetooth atau browser.", ready: true, group: "sales" },
  preorder: { label: "Bayar nanti", detail: "Simpan pesanan yang dibayar saat diambil.", ready: true, group: "sales" },
  customers: { label: "Nama pelanggan", detail: "Nama dan No. HP pelanggan di pesanan.", ready: true, group: "sales" },
  transfer: { label: "Transfer", detail: "Transfer bank sebagai metode bayar.", ready: true, group: "sales" },
  qris: { label: "QRIS", detail: "QRIS sebagai metode bayar.", ready: true, group: "sales" },
  kitchenTicket: { label: "Struk dapur", detail: "Cetak tiket dapur tanpa harga, dari pratinjau struk.", ready: true, group: "sales" },
  events: { label: "Event", detail: "Tandai pesanan dengan event, mis. bazar.", ready: false, group: "sales" },
  cashCount: { label: "Hitung kas", detail: "Hitung uang di laci tiap tutup.", ready: false, group: "sales" },
  proofPhotos: { label: "Foto bukti transfer", detail: "Foto bukti saat bayar transfer atau QRIS.", ready: false, group: "sales" },
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
