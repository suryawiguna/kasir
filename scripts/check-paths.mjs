#!/usr/bin/env node
/**
 * Menjaga aturan PLAN §3.2: semua akses koleksi lewat src/data/paths.ts.
 * Gagal bila ada `collection(db` atau `doc(db` di file lain di src/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const ALLOWED = new Set(["src/data/paths.ts"]);
const PATTERN = /\b(collection|doc|collectionGroup)\(\s*db\b/;

const offenders = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name)) {
      const rel = relative(ROOT, path);
      if (ALLOWED.has(rel)) continue;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (PATTERN.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        });
    }
  }
};
walk(SRC);

if (offenders.length) {
  console.error("\nAkses koleksi langsung di luar src/data/paths.ts:\n");
  for (const o of offenders) console.error(`  ${o}`);
  console.error("\nPakai shopCol()/shopDoc()/shopSingleton() dari src/data/paths.ts.\n");
  process.exit(1);
}
console.log("check-paths: ok");
