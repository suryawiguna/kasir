#!/usr/bin/env node
/**
 * Siapkan klien baru: `npm run new-client -- <slug> "<Nama Toko>"`.
 * Membuat clients/<slug>/client.json dan seed.json dari template, lalu
 * mencetak langkah manual yang tersisa (lihat docs/RUNBOOK.md).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail, parseArgs, ROOT } from "./lib/client.mjs";

const { positional } = parseArgs();
const [slug, name = slug] = positional;
if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) fail('Pemakaian: npm run new-client -- <slug> "<Nama Toko>"  (slug: huruf kecil, angka, -)');

const dir = join(ROOT, "clients", slug);
if (existsSync(join(dir, "client.json"))) fail(`clients/${slug}/client.json sudah ada.`);
mkdirSync(dir, { recursive: true });

writeFileSync(
  join(dir, "client.json"),
  JSON.stringify(
    {
      slug,
      name,
      shortName: name,
      usernameDomain: `${slug}.local`,
      hostingUrl: "",
      workerUrl: "",
      firebase: {
        apiKey: "ISI-DARI-FIREBASE-CONSOLE",
        authDomain: "ISI-PROJECT-ID.firebaseapp.com",
        projectId: "ISI-PROJECT-ID",
        appId: "ISI-DARI-FIREBASE-CONSOLE",
      },
    },
    null,
    2,
  ) + "\n",
);

const template = JSON.parse(readFileSync(join(ROOT, "clients", "demo", "seed.json"), "utf8"));
const seed = {
  _comment: "Isi awal toko. Ubah sesuai klien, atau kosongkan products dan biarkan pemilik mengisi dari aplikasi.",
  config: { ...template.config, name, receipt: { ...template.config.receipt, header: [name] } },
  features: template.features,
  branches: [{ id: "utama", name: "Toko utama", code: "UTM", active: true, order: 0 }],
  categories: [],
  stockItems: [],
  products: [],
  inventory: {},
};
writeFileSync(join(dir, "seed.json"), JSON.stringify(seed, null, 2) + "\n");

console.log(`
  clients/${slug}/ dibuat. Langkah berikutnya:

  1. Firebase console: buat project baru (paket Spark).
     - Authentication → Sign-in method → aktifkan Email/Password
     - Firestore → buat database, lokasi asia-southeast2 (Jakarta)
     - Project settings → Your apps → Web app → salin config ke clients/${slug}/client.json
     - Project settings → Service accounts → Generate new private key
       → simpan sebagai clients/${slug}/service-account.json (di-gitignore)
  2. npx firebase-tools use --add  (pilih project, alias: ${slug})
  3. npx firebase-tools deploy --only firestore --project ${slug}
  4. Sesuaikan clients/${slug}/seed.json, lalu: npm run seed -- --client ${slug}
  5. npm run set-admin -- --client ${slug} <username> <kata-sandi> owner
  6. npm run deploy -- --client ${slug}
`);
