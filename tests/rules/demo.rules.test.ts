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
 * firestore.demo.rules (project kasir-demo). Tamu anonim boleh memakai demo
 * yang sudah di-seed, tidak bisa membuat demo baru, dan tidak menyentuh apa
 * pun di luar demos/.
 */

let env: RulesTestEnvironment;

// Login anonim: request.auth ada, tanpa email dan tanpa claims.
const guest = (uid = "tamu1") =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const seed = async (path: string, data: Record<string, unknown>) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

const order = {
  id: "o1",
  orderNumber: "20261124-TIKA0001",
  branchId: "c1",
  deviceLetter: "A",
  items: [{ id: "l1", productId: "p1", name: "Siomay", unit: "pcs", quantity: 1, price: 5000, total: 5000, consumed: [] }],
  totalAmount: 5000,
  orderType: "instant",
  orderStatus: "completed",
  paymentStatus: "paid",
  paymentMethod: "cash",
  cashReceived: 5000,
  createdAt: "2026-11-24T02:00:00.000Z",
  createdBy: "tamu-abc123@kasir-demo.local",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-kasir",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(resolve(__dirname, "../../firestore.demo.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed("demos/aneka-ayam", { name: "Aneka Ayam Manado", template: "ayam" });
  await seed("demos/aneka-ayam/config/shop", { name: "Aneka Ayam Manado" });
  await seed("demos/aneka-ayam/inventory/c1", { levels: { ayam: 10 } });
  await seed("demos/cumeyume", { name: "Cumeyume", template: "dimsum" });
  await seed("demos/cumeyume/config/shop", { name: "Cumeyume" });
  await seed("config/shop", { name: "Data lama top-level" });
});

describe("dokumen demo", () => {
  it("tamu bisa membaca dokumen demo, tanpa login tidak", async () => {
    await assertSucceeds(getDoc(doc(guest(), "demos/aneka-ayam")));
    await assertFails(getDoc(doc(anon(), "demos/aneka-ayam")));
  });

  it("dokumen demos/{id} tidak bisa ditulis dari aplikasi", async () => {
    await assertFails(setDoc(doc(guest(), "demos/aneka-ayam"), { name: "Ganti" }));
    await assertFails(updateDoc(doc(guest(), "demos/aneka-ayam"), { name: "Ganti" }));
    await assertFails(deleteDoc(doc(guest(), "demos/aneka-ayam")));
    await assertFails(setDoc(doc(guest(), "demos/baru"), { name: "Demo sendiri" }));
  });

  it("membaca demo yang belum ada: dokumennya boleh dicek (halaman Demo tidak ditemukan)", async () => {
    await assertSucceeds(getDoc(doc(guest(), "demos/belum-ada")));
  });
});

describe("isi demo", () => {
  it("tamu bisa membaca dan menulis demo yang ada", async () => {
    const db = guest();
    await assertSucceeds(getDoc(doc(db, "demos/aneka-ayam/config/shop")));
    await assertSucceeds(setDoc(doc(db, "demos/aneka-ayam/config/shop"), { name: "Ayam Manado" }));
    await assertSucceeds(setDoc(doc(db, "demos/aneka-ayam/products/p1"), { id: "p1", name: "Ayam", price: 40000 }));
    await assertSucceeds(deleteDoc(doc(db, "demos/aneka-ayam/products/p1")));
  });

  it("checkout seperti aplikasi: pesanan + stok increment dalam satu batch", async () => {
    const db = guest();
    const batch = writeBatch(db);
    batch.set(doc(db, "demos/aneka-ayam/orders/o1"), order);
    batch.update(doc(db, "demos/aneka-ayam/inventory/c1"), { "levels.ayam": increment(-1), updatedAt: order.createdAt });
    await assertSucceeds(batch.commit());
  });

  it("query pesanan cabang seperti BranchContext", async () => {
    await seed("demos/aneka-ayam/orders/o1", order);
    await assertSucceeds(
      getDocs(
        query(
          collection(guest(), "demos/aneka-ayam/orders"),
          where("branchId", "==", "c1"),
          orderBy("createdAt", "desc"),
          limit(100),
        ),
      ),
    );
  });

  it("demo yang tidak ada: tidak bisa dibaca maupun dibuat", async () => {
    const db = guest();
    await assertFails(getDoc(doc(db, "demos/belum-ada/config/shop")));
    await assertFails(setDoc(doc(db, "demos/belum-ada/config/shop"), { name: "x" }));
    await assertFails(setDoc(doc(db, "demos/belum-ada/orders/o1"), order));
  });

  it("tanpa login tidak bisa membaca atau menulis", async () => {
    await assertFails(getDoc(doc(anon(), "demos/aneka-ayam/config/shop")));
    await assertFails(setDoc(doc(anon(), "demos/aneka-ayam/orders/o1"), order));
  });

  it("dokumen dengan field terlalu banyak ditolak", async () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 41; i++) big[`f${i}`] = i;
    await assertFails(setDoc(doc(guest(), "demos/aneka-ayam/products/p1"), big));
    delete big.f40;
    await assertSucceeds(setDoc(doc(guest(), "demos/aneka-ayam/products/p1"), big));
  });

  it("dua demo terpisah per path: tamu yang sama bisa membuka keduanya", async () => {
    await assertSucceeds(getDoc(doc(guest(), "demos/cumeyume/config/shop")));
  });
});

describe("di luar demos/", () => {
  it("koleksi top-level lama tidak bisa dibaca atau ditulis", async () => {
    const db = guest();
    await assertFails(getDoc(doc(db, "config/shop")));
    await assertFails(setDoc(doc(db, "config/shop"), { name: "x" }));
    await assertFails(setDoc(doc(db, "orders/o1"), order));
    await assertFails(getDocs(collection(db, "orders")));
  });

  it("daftar semua demo tidak bisa dibaca dari aplikasi", async () => {
    await assertFails(getDocs(collection(guest(), "demos")));
  });
});
