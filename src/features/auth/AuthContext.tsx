import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CLIENT } from "../../client";
import { auth } from "../../data/firebase";
import { parseClaims, usernameToEmail, type AuthClaims } from "./claims";

interface AuthState {
  loading: boolean;
  user: User | null;
  claims: AuthClaims | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Claims ada di ID token, jadi perubahan peran sampai ke sesi yang sedang
 * masuk saat token diperbarui. Token dipaksa diperbarui saat aplikasi kembali
 * ke depan, supaya itu menit, bukan jam.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<AuthClaims | null>(null);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (next) => {
        setUser(next);
        if (!next) {
          setClaims(null);
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
    [],
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
      login: async (username, password) => {
        await signInWithEmailAndPassword(auth, usernameToEmail(username, CLIENT.usernameDomain), password);
      },
      logout: () => signOut(auth),
    }),
    [loading, user, claims],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth di luar AuthProvider");
  return ctx;
};
