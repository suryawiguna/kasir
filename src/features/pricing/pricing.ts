import type { LineChoice, Product } from "../../domain/types";
import { divRound } from "../../lib/intMath";

/**
 * Harga satu produk di satu cabang, sebelum pilihan. Harga cabang menimpa
 * harga dasar bila diisi.
 */
export const basePriceFor = (product: Pick<Product, "price" | "priceByBranch">, branchId: string): number => {
  const override = product.priceByBranch?.[branchId];
  return typeof override === "number" && override >= 0 ? override : product.price;
};

/** Tambahan harga dari pilihan per 1 unit produk. */
export const choicesPriceDelta = (choices: readonly LineChoice[] | undefined): number =>
  (choices ?? []).reduce((sum, c) => sum + (c.priceDelta ?? 0) * c.count, 0);

/** Harga per satuan jual, sudah termasuk tambahan pilihan. */
export const unitPriceFor = (
  product: Pick<Product, "price" | "priceByBranch">,
  branchId: string,
  choices?: readonly LineChoice[],
): number => basePriceFor(product, branchId) + choicesPriceDelta(choices);

/**
 * Total satu baris: harga per satuan tampil × jumlah dalam satuan dasar ÷
 * faktor, dibulatkan ke rupiah terdekat (setengah ke atas).
 *
 * Rp25.000/kg × 1.234 gram ÷ 1000 = Rp30.850. Untuk satuan faktor 1 hasilnya
 * sama dengan harga × jumlah. **Ini satu-satunya tempat pembulatan rupiah.**
 */
export const lineTotal = (unitPrice: number, quantityBase: number, factor: number): number =>
  divRound(unitPrice * quantityBase, factor);

export const sumTotals = (lines: readonly { total: number }[]): number =>
  lines.reduce((sum, line) => sum + line.total, 0);
