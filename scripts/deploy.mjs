#!/usr/bin/env node
/**
 * Build dan deploy Hosting untuk satu klien, atau semua klien.
 *
 *   npm run deploy -- --client <slug>
 *   npm run deploy -- --all          # berhenti di klien pertama yang gagal
 *
 * Klien demo (project demo-*) dilewati: tidak punya project sungguhan.
 * Rules dan index tidak ikut di sini; publish terpisah dengan
 * `npx firebase-tools deploy --only firestore --project <slug>` supaya
 * perubahan rules selalu disengaja.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fail, loadClient, parseArgs, ROOT } from "./lib/client.mjs";

const { flags } = parseArgs();
const slugs = flags.all
  ? readdirSync(join(ROOT, "clients"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [flags.client];
if (!flags.all && !flags.client) fail("Pemakaian: npm run deploy -- --client <slug>   atau   --all");

const results = [];
for (const slug of slugs) {
  const { client } = loadClient(slug);
  if (client.firebase.projectId.startsWith("demo-")) {
    results.push([slug, "dilewati (demo)"]);
    continue;
  }
  console.log(`\n=== ${slug} (${client.firebase.projectId}) ===`);
  try {
    execFileSync("npx", ["vite", "build"], { stdio: "inherit", cwd: ROOT, env: { ...process.env, CLIENT: slug } });
    execFileSync(
      "npx",
      ["--yes", "firebase-tools@15", "deploy", "--only", "hosting", "--project", client.firebase.projectId],
      { stdio: "inherit", cwd: ROOT },
    );
    results.push([slug, "ok"]);
  } catch {
    results.push([slug, "GAGAL"]);
    break;
  }
}
console.log("\nRingkasan:");
for (const [slug, status] of results) console.log(`  ${slug.padEnd(24)} ${status}`);
process.exit(results.some(([, s]) => s === "GAGAL") ? 1 : 0);
