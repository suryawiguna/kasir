#!/usr/bin/env node
/**
 * Isi toko dari clients/<slug>/seed.json: config/shop, settings/features,
 * branches, categories, stockItems, products, inventory/{branchId}.
 *
 *   npm run seed -- --client demo            # emulator (project demo-*)
 *   npm run seed -- --client <slug>          # project sungguhan, butuh service account
 *   npm run seed -- --client <slug> --force  # timpa dokumen yang sudah ada
 *
 * Tanpa --force, dokumen yang sudah ada **tidak disentuh**: menjalankan seed
 * dua kali di toko yang sudah jualan tidak boleh mengembalikan harga dan stok
 * ke nilai contoh (pelajaran Haoshii: seed yang menimpa data hidup).
 *
 * Di emulator, `testUsers` dari seed.json dibuat sebagai akun uji.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { EMULATOR, fail, identityToolkit, loadClient, loadServiceAccount, parseArgs, useEmulator } from "./lib/client.mjs";

const { flags } = parseArgs();
const { client, dir } = loadClient(flags.client);
const emulator = useEmulator(client, flags);
const force = Boolean(flags.force);
const seedPath = join(dir, "seed.json");
if (!existsSync(seedPath)) fail(`Tidak ada ${seedPath}.`);
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

const projectId = client.firebase.projectId;
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR.firestore;
  initializeApp({ projectId });
} else {
  const { key } = loadServiceAccount(client, dir);
  initializeApp({ credential: cert(key), projectId });
}
const db = getFirestore();
const now = new Date().toISOString();
const by = "seed@" + client.usernameDomain;

let written = 0;
let skipped = 0;
const put = async (path, data) => {
  const ref = db.doc(path);
  if (!force && (await ref.get()).exists) {
    skipped++;
    return;
  }
  await ref.set(data);
  written++;
};

try {
  if (seed.config) await put("config/shop", { ...seed.config, updatedBy: by, updatedAt: now });
  if (seed.features) await put("settings/features", { ...seed.features, updatedBy: by, updatedAt: now });
  for (const b of seed.branches ?? []) {
    await put(`branches/${b.id}`, b);
    await put(`inventory/${b.id}`, { levels: seed.inventory?.[b.id] ?? {}, updatedBy: by, updatedAt: now });
  }
  for (const c of seed.categories ?? []) await put(`categories/${c.id}`, c);
  for (const s of seed.stockItems ?? []) await put(`stockItems/${s.id}`, s);
  for (const p of seed.products ?? []) await put(`products/${p.id}`, p);
} catch (error) {
  fail(emulator ? `Gagal menulis ke emulator (sudah npm run emulators?): ${error.message}` : error.message);
}

console.log(`\n  [${emulator ? "EMULATOR" : projectId}] seed ${client.slug}: ${written} ditulis, ${skipped} dilewati (sudah ada).`);

if (emulator && seed.testUsers?.length) {
  const call = await identityToolkit(client, flags, dir);
  for (const u of seed.testUsers) {
    const email = `${u.username}@${client.usernameDomain}`;
    let localId = (await call("/accounts:lookup", { email: [email] })).users?.[0]?.localId;
    if (!localId) localId = (await call("/accounts", { email, password: u.password, emailVerified: true })).localId;
    const claims = { admin: true, role: u.role, ...(u.branchId ? { branchId: u.branchId } : {}) };
    await call("/accounts:update", { localId, password: u.password, customAttributes: JSON.stringify(claims) });
    console.log(`    akun uji  ${u.username} / ${u.password}  (${u.role}${u.branchId ? `, ${u.branchId}` : ""})`);
  }
}
if (!emulator && !force && skipped) console.log("  Dokumen yang sudah ada tidak diubah. Pakai --force untuk menimpa.");
console.log("");
process.exit(0);
