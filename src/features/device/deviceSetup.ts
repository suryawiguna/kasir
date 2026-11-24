import type { Role } from "../../domain/types";
import { DEVICE_LETTER_PATTERN } from "../orders/orderNumber";

/**
 * Setup perangkat: cabang + huruf perangkat, disimpan di localStorage dengan
 * awalan slug klien. Huruf perangkat memisahkan urutan nomor pesanan antar
 * perangkat di cabang yang sama (lihat orderNumber.ts).
 *
 * Staf terkunci ke cabang di claim-nya: setup yang menyimpan cabang lain
 * diabaikan untuk staf. Hanya pemilik yang bisa mengganti setup.
 */
export interface DeviceSetup {
  branchId: string;
  deviceLetter: string;
}

export const parseDeviceSetup = (raw: string | null): DeviceSetup | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DeviceSetup>;
    if (typeof value.branchId !== "string" || !value.branchId) return null;
    if (typeof value.deviceLetter !== "string" || !DEVICE_LETTER_PATTERN.test(value.deviceLetter)) return null;
    return { branchId: value.branchId, deviceLetter: value.deviceLetter };
  } catch {
    return null;
  }
};

/**
 * Setup yang berlaku untuk pengguna ini, atau null bila perangkat perlu
 * disetup dulu. Untuk staf, cabang selalu dari claim.
 */
export const effectiveSetup = (
  stored: DeviceSetup | null,
  role: Role,
  claimBranchId: string | null,
  activeBranchIds: readonly string[],
): DeviceSetup | null => {
  if (!stored) return null;
  if (role === "staff") {
    if (!claimBranchId || stored.branchId !== claimBranchId) return null;
    return stored;
  }
  return activeBranchIds.includes(stored.branchId) ? stored : null;
};

export const DEVICE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Huruf pertama yang belum dipakai di cabang ini menurut pesanan yang terlihat. */
export const suggestDeviceLetter = (usedLetters: Iterable<string>): string => {
  const used = new Set(usedLetters);
  return DEVICE_LETTERS.find((l) => !used.has(l)) ?? "Z";
};

export const lastSequenceKey = (slug: string, branchId: string, letter: string) =>
  `${slug}:lastSeq:${branchId}:${letter}`;

export const deviceSetupKey = (slug: string) => `${slug}:device`;
