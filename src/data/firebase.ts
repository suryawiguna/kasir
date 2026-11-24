import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { CLIENT } from "../client";

/**
 * Emulator dipakai bila `VITE_USE_EMULATOR=true` (npm run dev:test) atau bila
 * project id klien diawali `demo-` (klien `demo` tidak punya project asli,
 * jadi tidak mungkin menyentuh data sungguhan).
 */
export const USE_EMULATOR =
  import.meta.env.VITE_USE_EMULATOR === "true" || CLIENT.firebase.projectId.startsWith("demo-");

const app = initializeApp(
  USE_EMULATOR && !CLIENT.firebase.projectId.startsWith("demo-")
    ? { ...CLIENT.firebase, projectId: `demo-${CLIENT.slug}` }
    : CLIENT.firebase,
);

/** Cache lokal persisten: kasir tetap jalan offline dan di banyak tab. */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);

if (USE_EMULATOR) {
  // Hostname halaman, supaya HP di Wi-Fi yang sama mencapai emulator di laptop.
  const host = window.location.hostname;
  connectFirestoreEmulator(db, host, 8080);
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
}
