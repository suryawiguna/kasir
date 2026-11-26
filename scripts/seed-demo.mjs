#!/usr/bin/env node
/**
 * Buat, daftar, atau hapus demo per calon klien di project kasir-demo.
 * Data setiap demo ada di `demos/{demoId}/...`; link-nya
 * `https://kasir-demo.web.app/d/{demoId}`. Lihat docs/RUNBOOK.md.
 *
 *   npm run seed-demo -- <demoId> --template <dimsum|ayam|cafe|salon>
 *       [--name "Nama Toko"] [--branches "Tikala,Perkamil"] [--color "#b45309"]
 *       [--products path/ke/produk.json] [--orders 7] [--contact "https://wa.me/62..."]
 *       [--force]
 *   npm run seed-demo -- --list              # daftar demo yang ada
 *   npm run seed-demo -- <demoId> --delete   # hapus satu demo
 *   ... --emulator                           # ke emulator (npm run emulators:demo)
 *
 * Tanpa --force, demo yang sudah ada tidak disentuh. --force menghapus semua
 * isi demo itu (termasuk pesanan yang dibuat pengunjung) lalu seed ulang.
 *
 * Isi dan pesanan contoh dibuat oleh modul TypeScript di src/features/demo/
 * (dimuat lewat Vite), yang memakai fungsi kasir yang sama, jadi bentuk data
 * sama persis dengan pesanan dari aplikasi.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createServer } from "vite";
import { EMULATOR, fail, loadClient, loadServiceAccount, parseArgs, ROOT, useEmulator } from "./lib/client.mjs";

const { flags, positional } = parseArgs();
const slug = typeof flags.client === "string" ? flags.client : "kasir-demo";
const { client, dir } = loadClient(slug);
if (client.demo !== true) fail(`clients/${slug}/client.json tidak berisi "demo": true. seed-demo hanya untuk project demo.`);

const TEMPLATE_DIR = join(dir, "templates");
const templates = existsSync(TEMPLATE_DIR)
  ? readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  : [];

// Modul murni dari src/ (TypeScript, import tanpa ekstensi) lewat Vite SSR.
const vite = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});
const load = (path) => vite.ssrLoadModule(path);
const demoId = await load("/src/features/demo/demoId.ts");
const demoTemplate = await load("/src/features/demo/demoTemplate.ts");
const sampleOrders = await load("/src/features/demo/sampleOrders.ts");
const done = async (code = 0) => {
  await vite.close();
  process.exit(code);
};
const stop = async (message) => {
  console.error(`\n  ${message}\n`);
  await done(1);
};

const emulator = useEmulator(client, flags);
// Aplikasi dengan VITE_USE_EMULATOR memakai project `demo-<slug>` (src/data/firebase.ts).
const projectId = emulator && !client.firebase.projectId.startsWith("demo-") ? `demo-${client.slug}` : client.firebase.projectId;
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR.firestore;
  process.env.METADATA_SERVER_DETECTION = "none";
  initializeApp({ projectId });
} else {
  const { key } = loadServiceAccount(client, dir);
  initializeApp({ credential: cert(key), projectId });
}
const db = getFirestore();
const where = emulator ? `EMULATOR ${projectId}` : projectId;
const linkFor = (id) => (emulator ? `http://localhost:3000${id === demoId.DEFAULT_DEMO_ID ? "/" : `/d/${id}`}` : demoId.demoLink(client.hostingUrl, id));

// ------------------------------------------------------------------ --list
if (flags.list) {
  const snap = await db.collection("demos").orderBy("createdAt", "desc").get();
  console.log(`\n  [${where}] ${snap.size} demo\n`);
  for (const d of snap.docs) {
    const data = d.data();
    console.log(`  ${d.id.padEnd(24)} ${String(data.template ?? "").padEnd(8)} ${String(data.createdAt ?? "").slice(0, 10)}  ${data.name ?? ""}`);
    console.log(`  ${"".padEnd(24)} ${linkFor(d.id)}`);
  }
  console.log("");
  await done();
}

const id = positional[0];
if (!id) await stop("Pemakaian: npm run seed-demo -- <demoId> --template <nama>   (atau --list, <demoId> --delete)");
if (!demoId.isValidDemoId(id)) await stop(`Id demo "${id}" tidak valid: huruf kecil, angka, dan -, 2-40 karakter.`);
const root = db.doc(`demos/${id}`);

// ---------------------------------------------------------------- --delete
if (flags.delete) {
  if (!(await root.get()).exists) {
    const children = await root.listCollections();
    if (children.length === 0) await stop(`Demo ${id} tidak ada.`);
  }
  await db.recursiveDelete(root);
  console.log(`\n  [${where}] demo ${id} dihapus.\n`);
  await done();
}

// ------------------------------------------------------------------- seed
const templateName = flags.template;
if (typeof templateName !== "string" || !templates.includes(templateName)) {
  await stop(`Pilih template: --template <${templates.join("|")}>`);
}
const template = JSON.parse(readFileSync(join(TEMPLATE_DIR, `${templateName}.json`), "utf8"));
delete template._comment;

let products;
if (typeof flags.products === "string") {
  const path = resolve(process.cwd(), flags.products);
  if (!existsSync(path)) await stop(`File produk tidak ada: ${path}`);
  products = JSON.parse(readFileSync(path, "utf8"));
}
const days = flags.orders === undefined ? 7 : Number(flags.orders);
if (!Number.isInteger(days) || days < 0 || days > 60) await stop("--orders harus bilangan 0-60 (jumlah hari).");
const contactUrl = typeof flags.contact === "string" ? flags.contact : "";
if (contactUrl && !/^https:\/\//.test(contactUrl)) await stop("--contact harus diawali https:// (mis. https://wa.me/62...).");

let seed;
try {
  seed = demoTemplate.applyOverrides(template, {
    name: typeof flags.name === "string" ? flags.name : undefined,
    color: typeof flags.color === "string" ? flags.color : undefined,
    branchNames: typeof flags.branches === "string" ? flags.branches.split(",") : undefined,
    products,
  });
} catch (error) {
  await stop(error.message);
}
const problems = demoTemplate.seedProblems(seed);
if (problems.length) await stop(`Isi demo bermasalah:\n    ${problems.join("\n    ")}`);

const exists = (await root.get()).exists || (await root.listCollections()).length > 0;
if (exists && !flags.force) await stop(`Demo ${id} sudah ada. Pakai --force untuk menghapus isinya dan seed ulang.`);
if (exists) {
  await db.recursiveDelete(root);
  console.log(`  [${where}] isi lama demo ${id} dihapus.`);
}

const now = new Date();
const nowIso = now.toISOString();
const by = `seed@${client.usernameDomain}`;
// Id tetap per demo: seed ulang menimpa dokumen yang sama, jadi cache offline
// pengunjung lama tidak sempat menampilkan pesanan ganda.
const idRandom = sampleOrders.mulberry32(sampleOrders.hashSeed(`${id}:ids`));
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const newId = () => Array.from({ length: 20 }, () => ID_CHARS[Math.floor(idRandom() * ID_CHARS.length)]).join("");
const { orders, inventory } = sampleOrders.generateSampleOrders({
  seed,
  days,
  now,
  random: sampleOrders.mulberry32(sampleOrders.hashSeed(id)),
  createdBy: `kasir@${client.usernameDomain}`,
  newId,
});

const writer = db.bulkWriter();
writer.onWriteError((error) => {
  console.error(`  gagal menulis ${error.documentRef.path}: ${error.message}`);
  return false;
});
const put = (path, data) => writer.set(db.doc(`demos/${id}/${path}`), data);
put("config/shop", { ...seed.config, updatedBy: by, updatedAt: nowIso });
put("settings/features", { ...seed.features, updatedBy: by, updatedAt: nowIso });
for (const b of seed.branches) put(`branches/${b.id}`, b);
for (const b of seed.branches) put(`inventory/${b.id}`, { levels: inventory[b.id] ?? {}, updatedBy: by, updatedAt: nowIso });
for (const c of seed.categories) put(`categories/${c.id}`, c);
for (const s of seed.stockItems) put(`stockItems/${s.id}`, s);
for (const p of seed.products) put(`products/${p.id}`, p);
for (const o of orders) put(`orders/${o.id}`, o);
try {
  await writer.close();
} catch (error) {
  await stop(emulator ? `Gagal menulis ke emulator (sudah npm run emulators:demo?): ${error.message}` : error.message);
}
// Dokumen demo terakhir: rules menolak semua isi sampai dokumen ini ada,
// jadi pengunjung tidak pernah melihat demo setengah jadi.
await root.set({ name: seed.config.name, template: templateName, createdAt: nowIso, ...(contactUrl ? { contactUrl } : {}) });

const cancelled = orders.filter((o) => o.orderStatus === "cancelled").length;
console.log(`
  [${where}] demo ${id} (${templateName}): ${seed.config.name}
    ${seed.branches.length} cabang (${seed.branches.map((b) => `${b.name} ${b.code}`).join(", ")}), ${seed.products.length} produk
    ${orders.length} pesanan contoh ${days} hari terakhir (${cancelled} batal)

  ${linkFor(id)}
`);
await done();
