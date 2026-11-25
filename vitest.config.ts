import { defineConfig } from "vitest/config";

/**
 * Hanya modul murni (tanpa Firebase, tanpa DOM): stok, uang, satuan, nomor
 * pesanan, tanggal bisnis. Di sanalah kesalahan berarti uang atau stok hilang.
 * Merender komponen butuh Firebase di-mock dan akhirnya hanya menguji mock-nya.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "worker/src/**/*.test.ts"],
  },
});
