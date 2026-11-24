import type { Role } from "../../domain/types";

/**
 * Custom claims di ID token, ditulis oleh `scripts/set-admin.mjs`. Tidak bisa
 * dipalsukan dari browser. Bacaan di sini harus sama dengan firestore.rules:
 * UI yang menawarkan tombol yang kemudian ditolak rules adalah bug.
 *
 * - `admin: true`   boleh memakai aplikasi sama sekali
 * - `role`          'owner' | 'staff' (tanpa role = tidak ada akses; berbeda
 *                   dari Haoshii, di sini tidak ada akun lama tanpa role)
 * - `branchId`      wajib untuk staf; staf hanya menulis untuk cabangnya
 *
 * `tenantId` belum ada (satu project per klien). Kalau nanti multi-tenant,
 * tambahkan di sini dan di rules.
 */
export interface AuthClaims {
  admin: boolean;
  role: Role | null;
  branchId: string | null;
}

export const parseClaims = (claims: Record<string, unknown>): AuthClaims => {
  const admin = claims.admin === true;
  const role = claims.role === "owner" || claims.role === "staff" ? claims.role : null;
  const branchId = typeof claims.branchId === "string" && claims.branchId ? claims.branchId : null;
  return { admin, role, branchId };
};

export type AccessProblem = "no-admin" | "no-role" | "staff-without-branch" | null;

/** Kenapa akun ini tidak bisa memakai aplikasi, atau null bila bisa. */
export const accessProblem = (claims: AuthClaims): AccessProblem => {
  if (!claims.admin) return "no-admin";
  if (!claims.role) return "no-role";
  if (claims.role === "staff" && !claims.branchId) return "staff-without-branch";
  return null;
};

export const ACCESS_PROBLEM_TEXT: Record<Exclude<AccessProblem, null>, string> = {
  "no-admin": "Akun ini belum diberi akses ke aplikasi kasir.",
  "no-role": "Akun ini belum punya peran (pemilik atau staf).",
  "staff-without-branch": "Akun staf ini belum ditempatkan di cabang mana pun.",
};

/** `kasir` → `kasir@<domain>`. Alamat lengkap dibiarkan. */
export const usernameToEmail = (username: string, domain: string): string => {
  const trimmed = username.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : `${trimmed}@${domain}`;
};

export const emailToUsername = (email: string | null | undefined, domain: string): string => {
  if (!email) return "";
  const suffix = `@${domain}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
};
