import { collection, doc, type CollectionReference, type DocumentData, type DocumentReference } from "firebase/firestore";
import { dataPath } from "../features/demo/demoId";
import { DATA_PREFIX, DEMO_ID } from "../features/demo/demo";
import { db } from "./firebase";

/**
 * **Satu-satunya tempat yang tahu path koleksi Firestore.**
 *
 * Klien biasa: semua koleksi di top-level (satu project Firebase per klien).
 * Mode demo (klien kasir-demo): semua koleksi di bawah `demos/{demoId}/`,
 * dengan id demo dari URL (features/demo/demo.ts). Kalau nanti pindah ke
 * multi-tenant, cukup awalan di sini (dan rules) yang berubah.
 *
 * Dilarang memanggil `collection(db, ...)` atau `doc(db, ...)` di luar file
 * ini. `npm run lint` menjalankan scripts/check-paths.mjs yang menolaknya.
 */
export type ShopCollection =
  | "orders"
  | "products"
  | "categories"
  | "stockItems"
  | "inventory"
  | "branches"
  | "stockChanges"
  | "customers"
  | "events"
  | "cashCounts";

export type ShopSingleton = ["config", "shop"] | ["settings", "features"];

export const shopCol = <T extends DocumentData = DocumentData>(name: ShopCollection): CollectionReference<T> =>
  collection(db, dataPath(DATA_PREFIX, name)) as CollectionReference<T>;

export const shopDoc = <T extends DocumentData = DocumentData>(name: ShopCollection, id: string): DocumentReference<T> =>
  doc(db, dataPath(DATA_PREFIX, name, id)) as DocumentReference<T>;

export const shopSingleton = <T extends DocumentData = DocumentData>(...path: ShopSingleton): DocumentReference<T> =>
  doc(db, dataPath(DATA_PREFIX, path[0], path[1])) as DocumentReference<T>;

/** Id dokumen baru tanpa round-trip (aman offline). */
export const newId = (name: ShopCollection): string => doc(collection(db, dataPath(DATA_PREFIX, name))).id;

/** Mode demo saja: `demos/{demoId}` (nama demo, link kontak). Ditulis hanya oleh script. */
export const demoRoot = <T extends DocumentData = DocumentData>(): DocumentReference<T> => {
  if (!DEMO_ID) throw new Error("demoRoot di luar mode demo");
  return doc(db, "demos", DEMO_ID) as DocumentReference<T>;
};
