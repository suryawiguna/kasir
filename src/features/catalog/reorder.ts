/**
 * Urutan produk di kasir. Murni: dipakai daftar produk (tombol dan geser)
 * dan dites.
 */

/** Pindahkan satu id ke posisi `to` (setelah id itu dikeluarkan dari daftar). */
export const moveId = (ids: readonly string[], id: string, to: number): string[] => {
  const rest = ids.filter((x) => x !== id);
  if (rest.length === ids.length) return [...ids];
  const at = Math.max(0, Math.min(rest.length, to));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
};

/**
 * Terapkan urutan baru sebagian daftar (mis. satu kategori) ke urutan
 * keseluruhan: anggota sebagian mengisi ulang posisi yang sama di daftar
 * penuh, produk lain tidak bergeser. Id di `subset` yang tidak ada di `all`
 * diabaikan.
 */
export const reorderWithin = (all: readonly string[], subset: readonly string[]): string[] => {
  const members = new Set(subset);
  const queue = subset.filter((id) => all.includes(id));
  if (queue.length !== members.size) return [...all];
  let next = 0;
  return all.map((id) => (members.has(id) ? queue[next++] : id));
};

/** Nilai `order` baru (0..n-1) untuk id yang berubah saja, supaya write sekecil mungkin. */
export const orderChanges = (
  current: readonly { id: string; order: number }[],
  orderedIds: readonly string[],
): { id: string; order: number }[] => {
  const before = new Map(current.map((x) => [x.id, x.order]));
  return orderedIds.flatMap((id, order) => (before.has(id) && before.get(id) !== order ? [{ id, order }] : []));
};
