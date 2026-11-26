import { onIdTokenChanged, signInAnonymously, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CLIENT } from "../../client";
import { auth } from "../../data/firebase";
import { IS_DEMO } from "../demo/demo";
import { DEMO_CLAIMS, demoActor, parseClaims, usernameToEmail, type AuthClaims } from "./claims";

interface AuthState {
  loading: boolean;
  user: User | null;
  claims: AuthClaims | null;
  /**
   * Yang dicap di field audit (createdBy, updatedBy, ...): email akun, atau
   * di mode demo nama tamu dari uid anonim. Kosong bila belum masuk.
   */
  actor: string;
  /** Mode demo: masuk anonim gagal (biasanya offline saat pertama buka). */
  demoSignInFailed: boolean;
  retryDemoSignIn: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Claims ada di ID token, jadi perubahan peran sampai ke sesi yang sedang
 * masuk saat token diperbarui. Token dipaksa diperbarui saat aplikasi kembali
 * ke depan, supaya itu menit, bukan jam.
 *
 * Mode demo: tanpa halaman masuk. Pengunjung masuk anonim otomatis dan
 * dianggap pemilik (claims disintesis, Spark tidak punya Functions untuk
 * memberi custom claims). Rules demo hanya meminta `request.auth != null`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<AuthClaims | null>(null);
  const [demoSignInFailed, setDemoSignInFailed] = useState(false);

  const demoSignIn = useCallback(() => {
    setDemoSignInFailed(false);
    setLoading(true);
    signInAnonymously(auth).catch((error) => {
      if (import.meta.env.DEV) console.error("signInAnonymously", error);
      setDemoSignInFailed(true);
      setLoading(false);
    });
  }, []);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (next) => {
        setUser(next);
        if (!next) {
          setClaims(null);
          if (IS_DEMO) {
            demoSignIn();
            return;
          }
          setLoading(false);
          return;
        }
        if (IS_DEMO) {
          setClaims(DEMO_CLAIMS);
          setLoading(false);
          return;
        }
        try {
          const token = await next.getIdTokenResult();
          setClaims(parseClaims(token.claims as Record<string, unknown>));
        } catch {
          setClaims(parseClaims({}));
        }
        setLoading(false);
      }),
    [demoSignIn],
  );

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && auth.currentUser && navigator.onLine) {
        void auth.currentUser.getIdToken(true).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      claims,
      actor: user ? (IS_DEMO ? demoActor(user.uid, CLIENT.usernameDomain) : (user.email ?? "")) : "",
      demoSignInFailed,
      retryDemoSignIn: demoSignIn,
      login: async (username, password) => {
        await signInWithEmailAndPassword(auth, usernameToEmail(username, CLIENT.usernameDomain), password);
      },
      logout: () => signOut(auth),
    }),
    [loading, user, claims, demoSignInFailed, demoSignIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth di luar AuthProvider");
  return ctx;
};
