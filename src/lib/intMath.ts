/**
 * Pembagian integer dengan pembulatan setengah ke atas, tanpa float.
 *
 * `Math.round(a * b / c)` bisa meleset di batas .5 karena float. Semua uang dan
 * stok di aplikasi ini integer, jadi pembagian dibulatkan dengan sisa bagi.
 * Hanya untuk pembilang >= 0 dan penyebut > 0.
 */
export const divRound = (numerator: number, denominator: number): number => {
  if (!(denominator > 0)) throw new Error("Penyebut harus > 0");
  if (numerator < 0) return -divRound(-numerator, denominator);
  const n = Math.round(numerator);
  const d = Math.round(denominator);
  const q = Math.floor(n / d);
  const r = n - q * d;
  return 2 * r >= d ? q + 1 : q;
};
