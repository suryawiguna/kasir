/**
 * Nomor pesanan yang aman untuk banyak perangkat dan banyak cabang, tanpa
 * server.
 *
 * Disimpan: `YYYYMMDD-<kodeCabang><hurufPerangkat><NNNN>`, mis. `20261124-TKLA0042`.
 * Tampil:   `A0042` di layar dan struk cabang, `TKL-A0042` di laporan gabungan.
 *
 * - **Tanggal** membuat nilai simpan unik selamanya dan bisa diurutkan di ekspor.
 * - **Kode cabang + huruf perangkat** memisahkan urutan: dua perangkat tidak
 *   pernah bisa menghasilkan nomor yang sama, karena masing-masing hanya
 *   menaikkan urutannya sendiri.
 * - **Urutan tidak di-reset harian** (pelajaran Haoshii: pesanan dibayar nanti
 *   yang dibuat hari lain bisa bertabrakan dengan nomor walk-in).
 *
 * Urutan dihitung dari pesanan di memori **dan** urutan terakhir yang disimpan
 * perangkat ini (localStorage). Tidak pernah lewat dokumen counter, karena
 * counter butuh server dan merusak checkout offline.
 */

export interface OrderNumberParts {
  date: string;
  branchCode: string;
  deviceLetter: string;
  sequence: number;
}

const PATTERN = /^(\d{8})-([A-Z0-9]{1,6}?)([A-Z])(\d{4,})$/;

export const BRANCH_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;
export const DEVICE_LETTER_PATTERN = /^[A-Z]$/;

export const parseOrderNumber = (orderNumber: string | undefined): OrderNumberParts | null => {
  const match = (orderNumber ?? "").match(PATTERN);
  if (!match) return null;
  return { date: match[1], branchCode: match[2], deviceLetter: match[3], sequence: Number(match[4]) };
};

/**
 * Urutan tertinggi milik cabang + perangkat ini, ditambah satu.
 *
 * `lastIssued` adalah urutan terakhir yang pernah dibuat perangkat ini (dari
 * localStorage). Ia menjaga nomor tetap naik walaupun pesanan lama perangkat
 * ini sudah keluar dari jendela realtime karena perangkat lain di cabang yang
 * sama berjualan lebih banyak.
 */
export const nextSequence = (
  orders: readonly { orderNumber?: string }[],
  branchCode: string,
  deviceLetter: string,
  lastIssued = 0,
): number => {
  let highest = Math.max(0, lastIssued);
  for (const order of orders) {
    const parts = parseOrderNumber(order.orderNumber);
    if (parts && parts.branchCode === branchCode && parts.deviceLetter === deviceLetter) {
      highest = Math.max(highest, parts.sequence);
    }
  }
  return highest + 1;
};

export const buildOrderNumber = (
  dateCompact: string,
  branchCode: string,
  deviceLetter: string,
  sequence: number,
): string => {
  if (!/^\d{8}$/.test(dateCompact)) throw new Error(`Tanggal tidak valid: ${dateCompact}`);
  if (!BRANCH_CODE_PATTERN.test(branchCode)) throw new Error(`Kode cabang tidak valid: ${branchCode}`);
  if (!DEVICE_LETTER_PATTERN.test(deviceLetter)) throw new Error(`Huruf perangkat tidak valid: ${deviceLetter}`);
  return `${dateCompact}-${branchCode}${deviceLetter}${String(sequence).padStart(4, "0")}`;
};

/** "A0042", atau "TKL-A0042" bila `withBranch`. Nomor asing dikembalikan apa adanya. */
export const formatOrderNumberShort = (orderNumber: string, withBranch = false): string => {
  const parts = parseOrderNumber(orderNumber);
  if (!parts) return orderNumber;
  const short = `${parts.deviceLetter}${String(parts.sequence).padStart(4, "0")}`;
  return withBranch ? `${parts.branchCode}-${short}` : short;
};

/** Apakah teks yang diketik cocok dengan nomor ini (pendek, dengan cabang, atau penuh). */
export const matchesOrderNumber = (orderNumber: string, query: string): boolean => {
  const q = query.trim().toUpperCase().replace(/^#/, "");
  if (!q) return false;
  const full = orderNumber.toUpperCase();
  if (full.includes(q)) return true;
  return formatOrderNumberShort(orderNumber, true).includes(q);
};
