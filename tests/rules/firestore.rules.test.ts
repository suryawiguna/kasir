import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

/**
 * firestore.rules di emulator sungguhan. Setiap write yang dibuat aplikasi,
 * sebagai peran yang membuatnya, harus lolos di sini; setiap write milik
 * pemilik harus gagal untuk staf; dan staf cabang A tidak pernah bisa menulis
 * ke cabang B.
 */

const OWNER = "owner@demo.local";
const STAFF_TKL = "kasir1@demo.local";
const STAFF_PKM = "kasir2@demo.local";

let env: RulesTestEnvironment;

const owner = () => env.authenticatedContext("owner", { email: OWNER, admin: true, role: "owner" }).firestore();
const staffTkl = () =>
  env.authenticatedContext("s1", { email: STAFF_TKL, admin: true, role: "staff", branchId: "tkl" }).firestore();
const staffPkm = () =>
  env.authenticatedContext("s2", { email: STAFF_PKM, admin: true, role: "staff", branchId: "pkm" }).firestore();
const staffNoBranch = () =>
  env.authenticatedContext("s3", { email: "x@demo.local", admin: true, role: "staff" }).firestore();
const noRole = () => env.authenticatedContext("s4", { email: "y@demo.local", admin: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const NOW = "2026-11-24T02:00:00.000Z";
const LATER = "2026-11-24T03:00:00.000Z";

const line = {
  id: "l1",
  productId: "as002",
  name: "Ayam Segar 40K",
  unit: "ekor",
  quantity: 1,
  price: 40000,
  total: 40000,
  consumed: [{ stockItemId: "ayam", qty: 1 }],
};

const baseOrder = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  orderNumber: "20261124-TKLA0001",
  branchId: "tkl",
  deviceLetter: "A",
  items: [line],
  totalAmount: 40000,
  orderType: "instant",
  orderStatus: "completed",
  paymentStatus: "paid",
  paymentMethod: "cash",
  cashReceived: 50000,
  createdAt: NOW,
  createdBy: STAFF_TKL,
  ...over,
});

const payLater = () => {
  const o: Record<string, unknown> = baseOrder({
    orderType: "preorder",
    orderStatus: "pending",
    paymentStatus: "unpaid",
    customerName: "Budi",
  });
  delete o.paymentMethod;
  delete o.cashReceived;
  return o;
};

const seed = async (path: string, data: Record<string, unknown>) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-kasir",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed("inventory/tkl", { levels: { ayam: 10 } });
  await seed("inventory/pkm", { levels: { ayam: 10 } });
});

describe("akses dasar", () => {
  it("tanpa login, tanpa peran, atau staf tanpa cabang tidak bisa membaca", async () => {
    await seed("config/shop", { name: "x" });
    await assertFails(getDoc(doc(anon(), "config/shop")));
    await assertFails(getDoc(doc(noRole(), "config/shop")));
    await assertFails(getDoc(doc(staffNoBranch(), "config/shop")));
    await assertSucceeds(getDoc(doc(staffTkl(), "config/shop")));
  });

  it("koleksi yang tidak didaftar ditolak", async () => {
    await assertFails(setDoc(doc(owner(), "random/x"), { a: 1 }));
  });
});

describe("config/shop dan settings/features", () => {
  const shop = {
    name: "Aneka Ayam Manado",
    brandColor: "#b91c1c",
    units: [{ code: "ekor", label: "ekor", factor: 1, decimals: 0, step: 1 }],
    receipt: { header: [], footer: ["Terima kasih"], showCustomerName: true, paperWidth: 32 },
    currency: "IDR",
    timezone: "Asia/Makassar",
    stockPolicy: "block",
    instantStatus: "completed",
    updatedBy: OWNER,
    updatedAt: NOW,
  };

  it("pemilik menulis, staf tidak", async () => {
    await assertSucceeds(setDoc(doc(owner(), "config/shop"), shop));
    await assertFails(setDoc(doc(staffTkl(), "config/shop"), { ...shop, updatedBy: STAFF_TKL }));
  });

  it("field asing, warna rusak, atau cap orang lain ditolak", async () => {
    await assertFails(setDoc(doc(owner(), "config/shop"), { ...shop, extra: 1 }));
    await assertFails(setDoc(doc(owner(), "config/shop"), { ...shop, brandColor: "red" }));
    await assertFails(setDoc(doc(owner(), "config/shop"), { ...shop, updatedBy: STAFF_TKL }));
  });

  it("logo: hanya key unggahan di brand/logo", async () => {
    await assertSucceeds(setDoc(doc(owner(), "config/shop"), { ...shop, logo: "brand/logo/3f9a1c0b7d2e4a55.png" }));
    await assertSucceeds(setDoc(doc(owner(), "config/shop"), { ...shop, logo: "brand/logo/3f9a1c0b7d2e4a55.jpg" }));
    await assertFails(setDoc(doc(owner(), "config/shop"), { ...shop, logo: "https://example.com/logo.png" }));
    await assertFails(setDoc(doc(owner(), "config/shop"), { ...shop, logo: "brand/logo/3f9a1c0b7d2e4a55.gif" }));
    await assertFails(setDoc(doc(owner(), "config/shop"), { ...shop, logo: "brand/logo/3F9A1C0B7D2E4A55.png" }));
    await assertFails(setDoc(doc(owner(), "config/shop"), { ...shop, logo: "products/as002/3f9a1c0b7d2e4a55.jpg" }));
    // logoUrl lama tetap bisa disimpan.
    await assertSucceeds(setDoc(doc(owner(), "config/shop"), { ...shop, logoUrl: "https://example.com/logo.png" }));
    await assertFails(setDoc(doc(staffTkl(), "config/shop"), { ...shop, logo: "brand/logo/3f9a1c0b7d2e4a55.png", updatedBy: STAFF_TKL }));
  });

  it("fitur: hanya boolean yang dikenal", async () => {
    const f = { multiBranch: true, weightSales: true, updatedBy: OWNER, updatedAt: NOW };
    await assertSucceeds(setDoc(doc(owner(), "settings/features"), f));
    await assertSucceeds(setDoc(doc(owner(), "settings/features"), { ...f, receipt: true, kitchenTicket: true }));
    await assertFails(setDoc(doc(owner(), "settings/features"), { ...f, receipt: "ya" }));
    await assertFails(setDoc(doc(owner(), "settings/features"), { ...f, qris: "ya" }));
    await assertFails(setDoc(doc(owner(), "settings/features"), { ...f, unknown: true }));
    await assertSucceeds(setDoc(doc(owner(), "settings/features"), { ...f, productPhotos: false }));
    await assertFails(setDoc(doc(owner(), "settings/features"), { ...f, productPhotos: "ya" }));
    const productFlags = { stockTracking: false, freeItems: true, branchPricing: true, sku: true };
    await assertSucceeds(setDoc(doc(owner(), "settings/features"), { ...f, ...productFlags }));
    for (const name of Object.keys(productFlags)) {
      await assertFails(setDoc(doc(owner(), "settings/features"), { ...f, [name]: "ya" }));
    }
    await assertFails(setDoc(doc(staffTkl(), "settings/features"), { ...f, updatedBy: STAFF_TKL }));
  });
});

describe("katalog", () => {
  const branch = { id: "tkl", name: "Lapak Tikala", code: "TKL", active: true, order: 0 };
  const product = {
    id: "as002",
    sku: "AS002",
    name: "Ayam Segar 40K",
    categoryId: "segar",
    price: 40000,
    unit: "ekor",
    soldBy: "count",
    stockMode: "shared",
    consumes: [{ stockItemId: "ayam", qty: 1 }],
    active: true,
    order: 1,
  };

  it("cabang: pemilik membuat, kode tidak bisa diganti", async () => {
    await assertSucceeds(setDoc(doc(owner(), "branches/tkl"), branch));
    await assertSucceeds(updateDoc(doc(owner(), "branches/tkl"), { name: "Tikala" }));
    await assertFails(updateDoc(doc(owner(), "branches/tkl"), { code: "TKX" }));
    await assertFails(setDoc(doc(owner(), "branches/x"), { ...branch, id: "x", code: "tk" }));
    await assertFails(setDoc(doc(staffTkl(), "branches/y"), { ...branch, id: "y" }));
    await assertFails(deleteDoc(doc(owner(), "branches/tkl")));
  });

  it("produk: pemilik saja, id harus cocok, mode stok dikenal", async () => {
    await assertSucceeds(setDoc(doc(owner(), "products/as002"), product));
    await assertSucceeds(
      setDoc(doc(owner(), "products/ph120"), {
        ...product,
        id: "ph120",
        stockMode: "none",
        consumes: [],
        choiceGroups: [{ id: "g", label: "Pilih 3 ayam", min: 3, max: 3, allowRepeat: true, options: [] }],
        priceByBranch: { pkm: 125000 },
        branchIds: ["tkl", "pkm"],
      }),
    );
    await assertFails(setDoc(doc(owner(), "products/zz"), product));
    await assertFails(setDoc(doc(owner(), "products/as002"), { ...product, stockMode: "magic" }));
    await assertFails(setDoc(doc(owner(), "products/as002"), { ...product, price: -1 }));
    await assertFails(setDoc(doc(staffTkl(), "products/as002"), product));
  });

  it("urutan produk: pemilik bisa mengubah order saja, staf tidak", async () => {
    await assertSucceeds(setDoc(doc(owner(), "products/as002"), product));
    await assertSucceeds(updateDoc(doc(owner(), "products/as002"), { order: 7 }));
    await assertFails(updateDoc(doc(owner(), "products/as002"), { order: "pertama" }));
    await assertFails(updateDoc(doc(staffTkl(), "products/as002"), { order: 0 }));
  });

  it("foto produk: key di folder produk itu sendiri, bukan URL atau produk lain", async () => {
    const key = "products/as002/3f9a1c0b7d2e4a55.jpg";
    await assertSucceeds(setDoc(doc(owner(), "products/as002"), { ...product, image: key }));
    await assertFails(setDoc(doc(owner(), "products/as002"), { ...product, image: "products/as003/3f9a1c0b7d2e4a55.jpg" }));
    await assertFails(setDoc(doc(owner(), "products/as002"), { ...product, image: "products/as002/3f9a1c0b7d2e4a55-t.jpg" }));
    await assertFails(setDoc(doc(owner(), "products/as002"), { ...product, image: "products/as002/3f9a1c0b7d2e4a55.png" }));
    await assertFails(setDoc(doc(owner(), "products/as002"), { ...product, image: "https://example.com/a.jpg" }));
    await assertFails(setDoc(doc(owner(), "products/as002"), { ...product, image: "" }));
    // Id dengan karakter regex tidak bisa membuat pola yang longgar.
    await assertFails(
      setDoc(doc(owner(), "products/a.b"), { ...product, id: "a.b", image: "products/axb/3f9a1c0b7d2e4a55.jpg" }),
    );
    await assertFails(setDoc(doc(staffTkl(), "products/as002"), { ...product, image: key }));
  });

  it("item stok tidak bisa dihapus (dipakai snapshot pesanan)", async () => {
    const item = { id: "ayam", name: "Ayam utuh", unit: "ekor", active: true, order: 0 };
    await assertSucceeds(setDoc(doc(owner(), "stockItems/ayam"), item));
    await assertFails(deleteDoc(doc(owner(), "stockItems/ayam")));
    await assertFails(setDoc(doc(staffTkl(), "stockItems/hati"), { ...item, id: "hati" }));
  });

  it("kategori", async () => {
    await assertSucceeds(setDoc(doc(owner(), "categories/segar"), { id: "segar", name: "Ayam Segar", order: 0, active: true }));
    await assertFails(setDoc(doc(staffTkl(), "categories/x"), { id: "x", name: "X", order: 0, active: true }));
  });
});

describe("inventory per cabang", () => {
  it("staf memotong stok cabangnya sendiri, bukan cabang lain", async () => {
    await assertSucceeds(
      updateDoc(doc(staffTkl(), "inventory/tkl"), { "levels.ayam": increment(-1), updatedBy: STAFF_TKL, updatedAt: NOW }),
    );
    await assertFails(
      updateDoc(doc(staffTkl(), "inventory/pkm"), { "levels.ayam": increment(-1), updatedBy: STAFF_TKL, updatedAt: NOW }),
    );
  });

  it("stok boleh negatif (tidak ada batas bawah)", async () => {
    await assertSucceeds(
      updateDoc(doc(staffTkl(), "inventory/tkl"), { "levels.ayam": increment(-50), updatedBy: STAFF_TKL, updatedAt: NOW }),
    );
  });

  it("staf tidak membaca stok cabang lain dan tidak membuat dokumen", async () => {
    await assertSucceeds(getDoc(doc(staffTkl(), "inventory/tkl")));
    await assertFails(getDoc(doc(staffTkl(), "inventory/pkm")));
    await assertFails(setDoc(doc(staffTkl(), "inventory/baru"), { levels: {}, updatedBy: STAFF_TKL }));
    await assertSucceeds(setDoc(doc(owner(), "inventory/baru"), { levels: {}, updatedBy: OWNER, updatedAt: NOW }));
  });

  it("update tanpa cap atau dengan field asing ditolak", async () => {
    await seed("inventory/tkl", { levels: { ayam: 10 }, updatedBy: OWNER });
    await assertFails(updateDoc(doc(staffTkl(), "inventory/tkl"), { "levels.ayam": increment(-1) }));
    await assertFails(
      updateDoc(doc(staffTkl(), "inventory/tkl"), { levels: "x", updatedBy: STAFF_TKL }),
    );
    await assertFails(
      updateDoc(doc(staffTkl(), "inventory/tkl"), { extra: 1, updatedBy: STAFF_TKL }),
    );
  });
});

describe("stockChanges", () => {
  const change = (over: Record<string, unknown> = {}) => ({
    id: "c1",
    branchId: "tkl",
    stockItemId: "ayam",
    kind: "set",
    before: 10,
    after: 12,
    changedBy: STAFF_TKL,
    changedAt: NOW,
    ...over,
  });

  it("staf mencatat hitung stok cabangnya sendiri saja", async () => {
    await assertSucceeds(setDoc(doc(staffTkl(), "stockChanges/c1"), change()));
    await assertFails(setDoc(doc(staffTkl(), "stockChanges/c2"), change({ id: "c2", branchId: "pkm" })));
    await assertFails(setDoc(doc(staffTkl(), "stockChanges/c3"), change({ id: "c3", changedBy: OWNER })));
    await assertFails(setDoc(doc(staffTkl(), "stockChanges/c4"), change({ id: "c4", after: -1 })));
    await assertFails(setDoc(doc(staffTkl(), "stockChanges/c5"), change({ id: "c5", kind: "add", after: 9 })));
    await assertSucceeds(setDoc(doc(staffTkl(), "stockChanges/c6"), change({ id: "c6", kind: "add", before: -5, after: -2 })));
  });

  it("tidak bisa diubah atau dihapus; staf hanya membaca cabangnya", async () => {
    await seed("stockChanges/c1", change());
    await seed("stockChanges/c9", change({ id: "c9", branchId: "pkm" }));
    await assertFails(updateDoc(doc(owner(), "stockChanges/c1"), { after: 1 }));
    await assertFails(deleteDoc(doc(owner(), "stockChanges/c1")));
    await assertSucceeds(getDocs(query(collection(staffTkl(), "stockChanges"), where("branchId", "==", "tkl"))));
    await assertFails(getDocs(query(collection(staffTkl(), "stockChanges"), where("branchId", "==", "pkm"))));
    await assertFails(getDocs(collection(staffTkl(), "stockChanges")));
  });
});

describe("orders: create", () => {
  it("checkout staf: pesanan + potong stok dalam satu batch", async () => {
    const db = staffTkl();
    const batch = writeBatch(db);
    batch.set(doc(db, "orders/o1"), baseOrder());
    batch.update(doc(db, "inventory/tkl"), { "levels.ayam": increment(-1), updatedBy: STAFF_TKL, updatedAt: NOW });
    await assertSucceeds(batch.commit());
  });

  it("staf tidak bisa membuat pesanan untuk cabang lain", async () => {
    await assertFails(setDoc(doc(staffTkl(), "orders/o1"), baseOrder({ branchId: "pkm" })));
    // Batch yang memotong stok cabang lain juga gagal seluruhnya.
    const db = staffTkl();
    const batch = writeBatch(db);
    batch.set(doc(db, "orders/o1"), baseOrder());
    batch.update(doc(db, "inventory/pkm"), { "levels.ayam": increment(-1), updatedBy: STAFF_TKL, updatedAt: NOW });
    await assertFails(batch.commit());
  });

  it("pemilik boleh membuat pesanan di cabang mana pun", async () => {
    await assertSucceeds(setDoc(doc(owner(), "orders/o1"), baseOrder({ branchId: "pkm", orderNumber: "20261124-PKMA0001", createdBy: OWNER })));
  });

  it("Bayar nanti tanpa metode bayar", async () => {
    await assertSucceeds(setDoc(doc(staffTkl(), "orders/o1"), payLater()));
    await assertFails(setDoc(doc(staffTkl(), "orders/o1"), { ...payLater(), paymentMethod: "cash" }));
  });

  it("menolak bentuk yang salah", async () => {
    const db = staffTkl();
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ createdBy: OWNER })));
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ id: "lain" })));
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ cashReceived: 30000 })));
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ orderNumber: "0001" })));
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ deviceLetter: "AB" })));
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ items: [] })));
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ orderStatus: "cancelled" })));
    await assertFails(setDoc(doc(db, "orders/o1"), baseOrder({ hacked: true })));
    const noMethod: Record<string, unknown> = baseOrder();
    delete noMethod.paymentMethod;
    delete noMethod.cashReceived;
    await assertFails(setDoc(doc(db, "orders/o1"), noMethod));
  });
});

describe("orders: read", () => {
  beforeEach(async () => {
    await seed("orders/o1", baseOrder());
    await seed("orders/o2", baseOrder({ id: "o2", branchId: "pkm", orderNumber: "20261124-PKMA0001", createdBy: STAFF_PKM }));
  });

  it("staf membaca cabangnya sendiri saja", async () => {
    await assertSucceeds(getDoc(doc(staffTkl(), "orders/o1")));
    await assertFails(getDoc(doc(staffTkl(), "orders/o2")));
    await assertSucceeds(
      getDocs(query(collection(staffTkl(), "orders"), where("branchId", "==", "tkl"), orderBy("createdAt", "desc"), limit(100))),
    );
    await assertFails(getDocs(query(collection(staffTkl(), "orders"), orderBy("createdAt", "desc"), limit(100))));
  });

  it("pemilik membaca semua cabang", async () => {
    await assertSucceeds(getDocs(query(collection(owner(), "orders"), orderBy("createdAt", "desc"), limit(100))));
  });
});

describe("orders: update", () => {
  const stamp = (email: string) => ({ updatedBy: email, updatedAt: LATER });

  it("staf memindahkan status dengan cap", async () => {
    await seed("orders/o1", baseOrder({ orderStatus: "pending" }));
    await assertSucceeds(updateDoc(doc(staffTkl(), "orders/o1"), { orderStatus: "ready", ...stamp(STAFF_TKL) }));
    await assertFails(updateDoc(doc(staffTkl(), "orders/o1"), { orderStatus: "completed" }));
    await assertFails(updateDoc(doc(staffPkm(), "orders/o1"), { orderStatus: "completed", ...stamp(STAFF_PKM) }));
  });

  it("staf tidak bisa membatalkan atau membuka lagi pesanan selesai", async () => {
    await seed("orders/o1", baseOrder());
    await assertFails(
      updateDoc(doc(staffTkl(), "orders/o1"), {
        orderStatus: "cancelled",
        cancelledBy: STAFF_TKL,
        cancelledAt: LATER,
        ...stamp(STAFF_TKL),
      }),
    );
    await assertFails(updateDoc(doc(staffTkl(), "orders/o1"), { orderStatus: "pending", ...stamp(STAFF_TKL) }));
  });

  it("staf tidak mengubah isi, total, atau pembayaran yang sudah lunas", async () => {
    await seed("orders/o1", baseOrder());
    await assertFails(updateDoc(doc(staffTkl(), "orders/o1"), { totalAmount: 1000, cashReceived: 1000, ...stamp(STAFF_TKL) }));
    await assertFails(
      updateDoc(doc(staffTkl(), "orders/o1"), { paymentMethod: "transfer", cashReceived: deleteField(), ...stamp(STAFF_TKL) }),
    );
  });

  it("staf menerima pembayaran pesanan Bayar nanti", async () => {
    await seed("orders/o1", payLater());
    await assertSucceeds(
      updateDoc(doc(staffTkl(), "orders/o1"), {
        paymentStatus: "paid",
        paymentMethod: "cash",
        cashReceived: 40000,
        paidAt: LATER,
        orderStatus: "completed",
        ...stamp(STAFF_TKL),
      }),
    );
  });

  it("pemilik membatalkan dengan cap, dan stok kembali dalam batch yang sama", async () => {
    await seed("orders/o1", baseOrder());
    const db = owner();
    const noStamp = writeBatch(db);
    noStamp.update(doc(db, "orders/o1"), { orderStatus: "cancelled", ...stamp(OWNER) });
    await assertFails(noStamp.commit());

    const batch = writeBatch(db);
    batch.update(doc(db, "orders/o1"), { orderStatus: "cancelled", cancelledBy: OWNER, cancelledAt: LATER, ...stamp(OWNER) });
    batch.update(doc(db, "inventory/tkl"), { "levels.ayam": increment(1), updatedBy: OWNER, updatedAt: LATER });
    await assertSucceeds(batch.commit());
  });

  it("tidak ada yang bisa mengganti cabang, nomor, atau pembuat; tidak ada hapus", async () => {
    await seed("orders/o1", baseOrder());
    await assertFails(updateDoc(doc(owner(), "orders/o1"), { branchId: "pkm", ...stamp(OWNER) }));
    await assertFails(updateDoc(doc(owner(), "orders/o1"), { orderNumber: "20261124-TKLA0002", ...stamp(OWNER) }));
    await assertFails(updateDoc(doc(owner(), "orders/o1"), { createdBy: OWNER, ...stamp(OWNER) }));
    await assertFails(deleteDoc(doc(owner(), "orders/o1")));
  });

  it("pemilik menandai belum lunas: metode bayar harus ikut dihapus", async () => {
    await seed("orders/o1", baseOrder());
    await assertFails(updateDoc(doc(owner(), "orders/o1"), { paymentStatus: "unpaid", ...stamp(OWNER) }));
    await assertSucceeds(
      updateDoc(doc(owner(), "orders/o1"), {
        paymentStatus: "unpaid",
        paymentMethod: deleteField(),
        cashReceived: deleteField(),
        ...stamp(OWNER),
      }),
    );
  });
});
