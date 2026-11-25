/**
 * Model data basis kasir. Tidak ada satu pun nama menu, satuan, atau angka
 * bisnis di sini: semuanya data yang dibuat pemilik dari Pengaturan.
 *
 * Aturan jumlah: **setiap jumlah stok dan jumlah jual disimpan sebagai integer
 * dalam satuan dasar** (gram untuk kg, ml untuk liter, 1 untuk ekor/pcs).
 * Dengan begitu `increment()` aman dan tidak ada error pembulatan float.
 */

export type Timezone = "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";

export interface ClientConfig {
  slug: string;
  name: string;
  shortName?: string;
  usernameDomain: string;
  hostingUrl: string;
  workerUrl: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    storageBucket?: string;
    messagingSenderId?: string;
  };
}

export interface Unit {
  /** Kunci yang direferensikan produk dan item stok. Tidak pernah berubah. */
  code: string;
  label: string;
  /** Nama satuan dasar bila berbeda, mis. "gram" untuk kg. */
  baseLabel?: string;
  /** Berapa satuan dasar dalam 1 satuan tampil. 1000 untuk kg. */
  factor: number;
  /** Angka di belakang koma saat tampil dan input. */
  decimals: number;
  /** Langkah input di kasir, dalam satuan tampil. */
  step: number;
  /** Disembunyikan dari pilihan baru. Satuan yang dipakai tidak pernah dihapus. */
  hidden?: boolean;
}

export type StockPolicy = "block" | "warn";
export type PaperWidth = 32 | 48;

export interface ShopConfig {
  name: string;
  /** Key R2 logo unggahan (`brand/logo/<hash>.png`), lihat features/media/imageKeys.ts. */
  logo?: string;
  /** Lama: URL logo yang diketik sebelum unggah ada. Masih dibaca bila `logo` kosong. */
  logoUrl?: string;
  brandColor: string;
  units: Unit[];
  receipt: {
    header: string[];
    footer: string[];
    showCustomerName: boolean;
    /** Karakter per baris: 32 untuk kertas 58 mm, 48 untuk 80 mm. */
    paperWidth: PaperWidth;
  };
  currency: "IDR";
  timezone: Timezone;
  /** "block": kasir tidak bisa menjual melebihi stok. "warn": hanya diberi tanda. */
  stockPolicy: StockPolicy;
  /** Pesanan langsung dicatat "completed" (toko ritel) atau "pending" (perlu disiapkan dulu). */
  instantStatus: "pending" | "completed";
  updatedBy?: string;
  updatedAt?: string;
}

export interface Branch {
  id: string;
  name: string;
  /** Kode pendek huruf besar, masuk ke nomor pesanan: "TKL". */
  code: string;
  receiptHeader?: string[];
  active: boolean;
  order: number;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  active: boolean;
}

export interface StockItem {
  id: string;
  name: string;
  /** Kode Unit. */
  unit: string;
  /** Dalam satuan dasar. Di bawah angka ini stok ditandai "menipis". */
  lowAt?: number;
  active: boolean;
  order: number;
  /** Diisi bila item ini dibuat otomatis untuk produk bermode "stok sendiri". */
  ownerProductId?: string;
}

export interface BranchInventory {
  /** stockItemId -> jumlah dalam satuan dasar. Boleh negatif (lihat rules). */
  levels: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Consume {
  stockItemId: string;
  /** Satuan dasar item stok, per 1 satuan jual produk. */
  qty: number;
}

export type StockMode = "own" | "shared" | "none";
export type SoldBy = "count" | "weight";

export interface ChoiceOption {
  id: string;
  label: string;
  /** Tambahan harga per pilihan, default 0. */
  priceDelta?: number;
  consumes?: Consume[];
  active?: boolean;
}

export interface ChoiceGroup {
  id: string;
  label: string;
  /** Jumlah pilihan per 1 unit produk. min == max == 3 artinya "pilih tepat 3". */
  min: number;
  max: number;
  /** Boleh memilih opsi yang sama lebih dari sekali (3× ukuran 40K). */
  allowRepeat: boolean;
  options: ChoiceOption[];
}

export interface FreeItem {
  productId: string;
  qty: number;
}

export interface Product {
  id: string;
  sku?: string;
  name: string;
  categoryId?: string;
  /** Per satuan jual (per kg kalau soldBy = 'weight'). */
  price: number;
  /** Kode Unit untuk satuan jual. */
  unit: string;
  soldBy: SoldBy;
  stockMode: StockMode;
  /** Per 1 satuan jual, dalam satuan dasar item stok. Diabaikan bila stockMode = 'none'. */
  consumes?: Consume[];
  choiceGroups?: ChoiceGroup[];
  freeItems?: FreeItem[];
  /** Kosong = dijual di semua cabang. */
  branchIds?: string[];
  priceByBranch?: Record<string, number>;
  /** Key R2, bukan bytes. */
  /** Key R2 foto (`products/<id>/<hash>.jpg`), bukan URL. Lihat features/media/imageKeys.ts. */
  image?: string;
  active: boolean;
  order: number;
}

export interface LineChoice {
  groupId: string;
  optionId: string;
  label: string;
  /** Berapa kali opsi ini dipilih per 1 unit produk. */
  count: number;
  priceDelta?: number;
}

export interface OrderLine {
  id: string;
  productId: string;
  name: string;
  sku?: string;
  unit: string;
  /** Satuan dasar (gram untuk kg). */
  quantity: number;
  /** Harga per satuan jual saat terjual, sudah termasuk tambahan pilihan. */
  price: number;
  total: number;
  choices?: LineChoice[];
  /** Snapshot: yang benar-benar terpotong saat jual, termasuk pilihan dan bonus. */
  consumed: Consume[];
  freeItems?: { productId: string; name: string; qty: number }[];
}

export type OrderType = "instant" | "preorder";
export type OrderStatus = "pending" | "ready" | "completed" | "cancelled";
export type PaymentStatus = "paid" | "unpaid";
export type PaymentMethod = "cash" | "transfer" | "qris";

export interface Order {
  id: string;
  orderNumber: string;
  branchId: string;
  deviceLetter: string;
  items: OrderLine[];
  totalAmount: number;
  orderType: OrderType;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Kosong sampai uang benar-benar diterima. */
  paymentMethod?: PaymentMethod;
  /** Selalu diketik kasir. Kembalian diturunkan, tidak disimpan. */
  cashReceived?: number;
  paidAt?: string;
  customerId?: string;
  customerName?: string;
  customerContact?: string;
  pickupTime?: string;
  eventId?: string;
  eventName?: string;
  paymentProof?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

export interface StockChange {
  id: string;
  branchId: string;
  stockItemId: string;
  /** "add" = stok masuk, "set" = hitung ulang. */
  kind: "add" | "set";
  before: number;
  after: number;
  note?: string;
  changedBy: string;
  changedAt: string;
}

export type Role = "owner" | "staff";
