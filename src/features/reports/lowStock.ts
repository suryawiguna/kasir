import type { Branch, StockItem } from "../../domain/types";
import { stockLevelState } from "../stock/consumption";

export interface LowStockRow {
  branchId: string;
  item: StockItem;
  /** Satuan dasar. */
  level: number;
  state: "low" | "empty";
}

/**
 * Item stok aktif yang menipis (`level <= lowAt`) atau habis, per cabang.
 * Cabang yang dokumen stoknya belum terbaca dilewati, bukan dianggap habis.
 * Habis dulu, lalu urut cabang dan item.
 */
export const lowStock = (
  stockItems: readonly StockItem[],
  levelsByBranch: Record<string, Record<string, number> | undefined>,
  branches: readonly Branch[],
  branchId?: string,
): LowStockRow[] => {
  const rows: LowStockRow[] = [];
  const shown = [...branches].filter((b) => b.active && (!branchId || b.id === branchId)).sort((a, b) => a.order - b.order);
  const items = stockItems.filter((s) => s.active).sort((a, b) => a.order - b.order);
  for (const branch of shown) {
    const levels = levelsByBranch[branch.id];
    if (!levels) continue;
    for (const item of items) {
      const level = levels[item.id] ?? 0;
      const state = stockLevelState(level, item);
      if (state !== "ok") rows.push({ branchId: branch.id, item, level, state });
    }
  }
  return rows.sort((a, b) => (a.state === b.state ? 0 : a.state === "empty" ? -1 : 1));
};
