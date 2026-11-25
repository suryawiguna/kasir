#!/usr/bin/env node
/**
 * Menjaga dua aturan struktur:
 * - PLAN §3.2: semua akses koleksi lewat src/data/paths.ts. Gagal bila ada
 *   `collection(db` atau `doc(db` di file lain di src/.
 * - Gambar (docs/IMAGES-PLAN.md): `<img` hanya di komponen gambar, supaya
 *   URL R2, cache, dan cadangan saat gagal dimuat diatur di satu tempat.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const RULES = [
  {
    pattern: /\b(collection|doc|collectionGroup)\(\s*db\b/,
    allowed: new Set(["src/data/paths.ts"]),
    message: "Akses koleksi langsung di luar src/data/paths.ts. Pakai shopCol()/shopDoc()/shopSingleton().",
  },
  {
    pattern: /<img\b/,
    only: /\.tsx$/,
    allowed: new Set(["src/components/ProductImage.tsx", "src/components/ShopLogo.tsx", "src/components/ImagePicker.tsx"]),
    message: "<img> di luar komponen gambar. Pakai <ProductImage> atau <ShopLogo>.",
  },
];

const offenders = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name)) {
      const rel = relative(ROOT, path);
      const lines = readFileSync(path, "utf8").split("\n");
      for (const rule of RULES) {
        if (rule.allowed.has(rel) || (rule.only && !rule.only.test(rel))) continue;
        lines.forEach((line, i) => {
          if (rule.pattern.test(line)) offenders.push({ rule, where: `${rel}:${i + 1}  ${line.trim()}` });
        });
      }
    }
  }
};
walk(SRC);

if (offenders.length) {
  for (const rule of RULES) {
    const mine = offenders.filter((o) => o.rule === rule);
    if (!mine.length) continue;
    console.error(`\n${rule.message}\n`);
    for (const o of mine) console.error(`  ${o.where}`);
  }
  console.error("");
  process.exit(1);
}
console.log("check-paths: ok");
