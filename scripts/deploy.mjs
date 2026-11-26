#!/usr/bin/env node
/**
 * Build dan deploy Hosting untuk satu klien, atau semua klien.
 *
 *   npm run deploy -- --client <slug>
 *   npm run deploy -- --all          # berhenti di klien pertama yang gagal
 *   npm run deploy -- --client <slug> --rules   # HANYA rules + index Firestore
 *
 * Klien demo (project demo-*) dilewati: tidak punya project sungguhan.
 * Rules dan index tidak ikut deploy Hosting; `--rules` mem-publish-nya
 * terpisah supaya perubahan rules selalu disengaja. Klien dengan
 * `"demo": true` (kasir-demo) memakai firestore.demo.rules lewat
 * firebase.demo.json, klien lain firestore.rules lewat firebase.json.
 * Jangan menjalankan `firebase deploy --only firestore` langsung untuk
 * kasir-demo: itu mem-publish firestore.rules dan semua demo berhenti jalan.
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
if (flags.rules && flags.all) fail("--rules hanya untuk satu klien: npm run deploy -- --client <slug> --rules");

if (flags.rules) {
  const { client } = loadClient(flags.client);
  if (client.firebase.projectId.startsWith("demo-")) fail(`${flags.client} memakai emulator, tidak ada rules untuk di-deploy.`);
  const config = client.demo === true ? "firebase.demo.json" : "firebase.json";
  console.log(`\n=== rules ${flags.client} (${client.firebase.projectId}) dari ${config} ===`);
  try {
    execFileSync(
      "npx",
      ["--yes", "firebase-tools@15", "deploy", "--only", "firestore", "--project", client.firebase.projectId, "--config", config],
      { stdio: "inherit", cwd: ROOT },
    );
  } catch {
    process.exit(1);
  }
  process.exit(0);
}

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
