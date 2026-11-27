import { onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { shopDoc } from "../../data/paths";
import type { Branch } from "../../domain/types";
import { useBranch } from "../orders/BranchContext";

/**
 * Stok semua cabang aktif untuk Laporan → Stok menipis. Cabang perangkat ini
 * memakai dokumen yang sudah didengarkan BranchProvider (0 baca); cabang lain
 * satu listener per cabang (1 dokumen) selama tab terbuka.
 */
export function useBranchLevels(branches: readonly Branch[], enabled: boolean): Record<string, Record<string, number> | undefined> {
  const { branch, inventory } = useBranch();
  const [others, setOthers] = useState<Record<string, Record<string, number>>>({});
  const otherIds = branches
    .filter((b) => b.active && b.id !== branch?.id)
    .map((b) => b.id)
    .join(",");

  useEffect(() => {
    if (!enabled || !otherIds) return;
    const unsubs = otherIds.split(",").map((id) =>
      onSnapshot(shopDoc("inventory", id), (snap) => {
        const levels = (snap.data()?.levels ?? {}) as Record<string, number>;
        setOthers((prev) => ({ ...prev, [id]: levels }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [enabled, otherIds]);

  return useMemo(() => ({ ...others, ...(branch && inventory ? { [branch.id]: inventory.levels } : {}) }), [others, branch, inventory]);
}
