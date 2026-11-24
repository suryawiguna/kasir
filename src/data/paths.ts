import { collection, doc, type CollectionReference, type DocumentData, type DocumentReference } from "firebase/firestore";
import { db } from "./firebase";

/**
 * **Satu-satunya tempat yang tahu path koleksi Firestore.**
 *
 * Sekarang semua koleksi ada di top-level (satu project Firebase per klien).
 * Kalau nanti pindah ke multi-tenant dalam satu project, cukup fungsi di sini
 * (dan firestore.rules) yang berubah menjadi `tenants/{tenantId}/...`.
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
  collection(db, name) as CollectionReference<T>;

export const shopDoc = <T extends DocumentData = DocumentData>(name: ShopCollection, id: string): DocumentReference<T> =>
  doc(db, name, id) as DocumentReference<T>;

export const shopSingleton = <T extends DocumentData = DocumentData>(...path: ShopSingleton): DocumentReference<T> =>
  doc(db, path[0], path[1]) as DocumentReference<T>;

/** Id dokumen baru tanpa round-trip (aman offline). */
export const newId = (name: ShopCollection): string => doc(collection(db, name)).id;
