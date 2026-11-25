import { CLIENT } from "../../client";
import { imageUrl } from "./imageKeys";
import { describeUploadFailure, isRetryable, MAX_ATTEMPTS, retryDelayMs, TIMEOUT_MS, type UploadFailure } from "./uploadPolicy";

/**
 * Unggah ke Worker `kasir-media`. Boleh di-`await`: aturan "jangan await"
 * berlaku untuk tulis Firestore (yang tetap tersimpan offline), sedangkan
 * unggah memang butuh internet dan pemilik menunggu hasilnya.
 */

export class UploadError extends Error {
  constructor(readonly failure: UploadFailure) {
    super(describeUploadFailure(failure));
  }
}

/** Unggah foto aktif untuk klien ini (`workerUrl` terisi di client.json). */
export const uploadsEnabled = (): boolean => Boolean(CLIENT.workerUrl);

/** URL tampil untuk key yang tersimpan, atau null. */
export const mediaUrl = (key: string | undefined): string | null =>
  key ? imageUrl(CLIENT.workerUrl, CLIENT.slug, key) : null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const attempt = async (key: string, blob: Blob, token: string): Promise<UploadFailure | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CLIENT.workerUrl.replace(/\/+$/, "")}/v1/${key}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
      signal: controller.signal,
    });
    if (res.ok) return null;
    let code: string | undefined;
    try {
      code = ((await res.json()) as { error?: string }).error;
    } catch {
      // Jawaban bukan JSON (mis. halaman galat proxy).
    }
    return { status: res.status, code };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
  }
};

export const uploadImage = async (key: string, blob: Blob, getToken: () => Promise<string>): Promise<void> => {
  if (!uploadsEnabled()) throw new UploadError({ status: 403, code: "unknown_client" });
  let failure: UploadFailure | null = null;
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    let token: string;
    try {
      token = await getToken();
    } catch {
      throw new UploadError({ status: 401 });
    }
    failure = await attempt(key, blob, token);
    if (!failure) return;
    if (!isRetryable(failure) || n === MAX_ATTEMPTS) break;
    await wait(retryDelayMs(n));
  }
  throw new UploadError(failure ?? { status: 0 });
};
