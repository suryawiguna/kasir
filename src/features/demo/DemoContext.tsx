import { onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CLIENT } from "../../client";
import { demoRoot } from "../../data/paths";

/**
 * Dokumen `demos/{demoId}` (ditulis `npm run seed-demo`): ada atau tidaknya
 * menentukan apakah demo ini bisa dibuka. Rules demo menolak tulis di bawah
 * demo yang belum di-seed, jadi slug acak tidak bisa membuat data.
 */
export type DemoState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; name: string; contactUrl: string };

const DemoContext = createContext<DemoState>({ status: "loading" });

interface DemoDoc {
  name?: unknown;
  contactUrl?: unknown;
}

const safeUrl = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return /^https:\/\//.test(value) ? value : "";
};

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>({ status: "loading" });

  useEffect(
    () =>
      onSnapshot(
        demoRoot<DemoDoc>(),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setState({
              status: "ready",
              name: typeof data.name === "string" ? data.name : "",
              contactUrl: safeUrl(data.contactUrl) || safeUrl(CLIENT.demoContactUrl),
            });
          } else if (!snap.metadata.fromCache) {
            // Cache kosong belum berarti tidak ada: tunggu jawaban server.
            setState({ status: "missing" });
          }
        },
        (error) => {
          if (import.meta.env.DEV) console.error("demo", error);
          setState({ status: "missing" });
        },
      ),
    [],
  );

  return <DemoContext.Provider value={state}>{children}</DemoContext.Provider>;
}

export const useDemo = (): DemoState => useContext(DemoContext);
