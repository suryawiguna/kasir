/**
 * Bantuan bersama untuk script per klien: `--client <slug>` memilih
 * clients/<slug>/client.json dan clients/<slug>/service-account.json.
 *
 * Klien yang project id-nya diawali `demo-` (atau `--emulator`) selalu
 * diarahkan ke emulator lokal, jadi tidak mungkin menyentuh data sungguhan.
 */
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const fail = (message) => {
  console.error(`\n  ${message}\n`);
  process.exit(1);
};

/** `--name value`, `--name=value`, dan flag boolean. Sisanya positional. */
export const parseArgs = (argv = process.argv.slice(2)) => {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=", 2);
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
      else flags[key] = true;
    } else positional.push(arg);
  }
  return { flags, positional };
};

export const loadClient = (slug) => {
  if (!slug || slug === true) fail("Sebutkan klien: --client <slug> (lihat folder clients/).");
  const dir = join(ROOT, "clients", slug);
  const path = join(dir, "client.json");
  if (!existsSync(path)) fail(`Tidak ada ${path}. Buat dengan: npm run new-client -- ${slug}`);
  const client = JSON.parse(readFileSync(path, "utf8"));
  if (client.slug !== slug) fail(`${path} berisi slug "${client.slug}", bukan "${slug}".`);
  if (/ISI-/.test(client.firebase.projectId)) {
    fail(`clients/${slug}/client.json belum diisi (projectId masih "${client.firebase.projectId}").`);
  }
  return { client, dir };
};

export const useEmulator = (client, flags) => Boolean(flags.emulator) || client.firebase.projectId.startsWith("demo-");

export const EMULATOR = { firestore: "127.0.0.1:8080", auth: "127.0.0.1:9099" };

export const loadServiceAccount = (client, dir) => {
  const keyPath = process.env.SERVICE_ACCOUNT_KEY || join(dir, "service-account.json");
  if (!existsSync(keyPath)) {
    fail(
      `Service account tidak ditemukan di ${keyPath}.\n` +
        `  Firebase console → Project settings → Service accounts → Generate new private key,\n` +
        `  simpan sebagai clients/${client.slug}/service-account.json (di-gitignore).`,
    );
  }
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  if (key.project_id !== client.firebase.projectId) {
    fail(`Key untuk project "${key.project_id}", tetapi klien ${client.slug} memakai "${client.firebase.projectId}".`);
  }
  return { key, keyPath };
};

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Token OAuth2 dari service account, tanpa firebase-admin/auth (lihat set-admin di Haoshii). */
export const getAccessToken = async (key) => {
  const now = Math.floor(Date.now() / 1000);
  const input =
    `${b64url({ alg: "RS256", typ: "JWT" })}.` +
    b64url({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  const signature = createSign("RSA-SHA256").update(input).sign(key.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${signature}` }),
  });
  const body = await response.json();
  if (!response.ok) fail(`Gagal mendapat access token: ${body.error_description || JSON.stringify(body)}`);
  return body.access_token;
};

/**
 * Pemanggil Identity Toolkit untuk project klien. Di emulator, token
 * "owner" diterima sebagai admin.
 */
export const identityToolkit = async (client, flags, dir) => {
  const emulator = useEmulator(client, flags);
  const projectId = client.firebase.projectId;
  const base = emulator
    ? `http://${EMULATOR.auth}/identitytoolkit.googleapis.com/v1/projects/${projectId}`
    : `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  const token = emulator ? "owner" : await getAccessToken(loadServiceAccount(client, dir).key);
  return async (path, payload) => {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      fail(emulator ? "Emulator Auth tidak jalan. Jalankan dulu: npm run emulators" : `Gagal menghubungi ${base}`);
    }
    const body = await response.json();
    if (!response.ok) {
      const reason = body?.error?.message || JSON.stringify(body);
      if (/CONFIGURATION_NOT_FOUND|PROJECT_NOT_FOUND/.test(reason)) {
        fail("Login Email/Password belum diaktifkan: Firebase console → Authentication → Sign-in method.");
      }
      fail(`${path} gagal: ${reason}`);
    }
    return body;
  };
};
