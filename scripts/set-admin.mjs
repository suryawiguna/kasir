#!/usr/bin/env node
/**
 * Buat akun kasir dan beri custom claims `admin`, `role`, dan (staf) `branchId`.
 *
 *   npm run set-admin -- --client <slug> <username> <kata-sandi> owner
 *   npm run set-admin -- --client <slug> <username> <kata-sandi> staff --branch tkl
 *   npm run set-admin -- --client <slug> --revoke <username>
 *
 * Peran wajib ditulis (tidak ada default): default owner membagi akses penuh
 * karena salah ketik, default staff menurunkan pemilik saat reset kata sandi.
 * Staf wajib punya --branch; rules hanya mengizinkan staf menulis untuk
 * cabangnya. Menjalankan ulang untuk username yang sama mengganti kata sandi,
 * peran, dan cabangnya.
 *
 * --revoke menghapus claims, menonaktifkan akun, dan membatalkan semua token.
 * Klien demo (project demo-*) selalu ke emulator.
 */
import { fail, identityToolkit, loadClient, parseArgs, useEmulator } from "./lib/client.mjs";

const { flags, positional } = parseArgs();
const { client, dir } = loadClient(flags.client);
const revoke = Boolean(flags.revoke);
const [username, password, role] = revoke ? [typeof flags.revoke === "string" ? flags.revoke : positional[0]] : positional;
const branchId = typeof flags.branch === "string" ? flags.branch : undefined;

if (!username || (!revoke && (!password || !role))) {
  fail(
    "Pemakaian:\n" +
      "  npm run set-admin -- --client <slug> <username> <kata-sandi> owner\n" +
      "  npm run set-admin -- --client <slug> <username> <kata-sandi> staff --branch <branchId>\n" +
      "  npm run set-admin -- --client <slug> --revoke <username>",
  );
}
if (!revoke && !["owner", "staff"].includes(role)) fail(`Peran harus "owner" atau "staff", bukan "${role}".`);
if (!revoke && role === "staff" && !branchId) fail("Akun staf wajib punya --branch <branchId>.");
if (!revoke && role === "owner" && branchId) fail("Pemilik tidak terikat cabang; hapus --branch.");
if (!revoke && password.length < 6) fail("Kata sandi minimal 6 karakter.");

const email = username.includes("@") ? username.trim().toLowerCase() : `${username.trim().toLowerCase()}@${client.usernameDomain}`;
const call = await identityToolkit(client, flags, dir);
const target = useEmulator(client, flags) ? "EMULATOR" : client.firebase.projectId;

const found = (await call("/accounts:lookup", { email: [email] })).users?.[0];

if (revoke) {
  if (!found) fail(`Tidak ada akun "${username}" (${email}).`);
  await call("/accounts:update", {
    localId: found.localId,
    customAttributes: JSON.stringify({}),
    disableUser: true,
    validSince: String(Math.floor(Date.now() / 1000)),
  });
  console.log(`\n  [${target}] Akun ${email} dicabut dan dinonaktifkan.\n`);
  process.exit(0);
}

let localId = found?.localId;
const created = !localId;
if (created) localId = (await call("/accounts", { email, password, emailVerified: true })).localId;

const claims = { admin: true, role, ...(branchId ? { branchId } : {}) };
await call("/accounts:update", {
  localId,
  ...(created ? {} : { password }),
  customAttributes: JSON.stringify(claims),
  disableUser: false,
});

const verify = (await call("/accounts:lookup", { localId: [localId] })).users?.[0];
const stored = JSON.parse(verify?.customAttributes || "{}");
const ok = stored.admin === true && stored.role === role && (stored.branchId ?? undefined) === branchId;

console.log(`\n  [${target}] ${created ? "Akun dibuat" : "Akun diperbarui"}`);
console.log(`    username  ${username}`);
console.log(`    email     ${email}`);
console.log(`    peran     ${stored.role ?? "TIDAK TERSIMPAN"}`);
if (branchId) console.log(`    cabang    ${stored.branchId ?? "TIDAK TERSIMPAN"}`);
console.log(ok ? "\n  Siap dipakai.\n" : "\n  Verifikasi claims gagal. Jangan pakai akun ini.\n");
process.exit(ok ? 0 : 1);
