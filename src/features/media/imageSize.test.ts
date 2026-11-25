import { describe, expect, it } from "vitest";
import { centerSquare, checkSourceFile, checkSourceSize, fitWithin } from "./imageSize";
import { describeUploadFailure, isRetryable, retryDelayMs } from "./uploadPolicy";

describe("ukuran gambar", () => {
  it("memperkecil sisi terpanjang, tidak pernah memperbesar", () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin({ width: 3024, height: 4032 }, 1024)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin({ width: 300, height: 200 }, 1024)).toEqual({ width: 300, height: 200 });
    expect(fitWithin({ width: 10000, height: 1 }, 1024)).toEqual({ width: 1024, height: 1 });
  });

  it("persegi tengah untuk thumbnail", () => {
    expect(centerSquare({ width: 400, height: 300 })).toEqual({ x: 50, y: 0, width: 300, height: 300 });
    expect(centerSquare({ width: 300, height: 401 })).toEqual({ x: 0, y: 50, width: 300, height: 300 });
  });

  it("file yang jelas tidak bisa dipakai ditolak sebelum didekode", () => {
    expect(checkSourceFile({ type: "image/jpeg", size: 2_000_000 })).toBeNull();
    // iOS kadang memberi tipe kosong; tetap dicoba.
    expect(checkSourceFile({ type: "", size: 2_000_000 })).toBeNull();
    expect(checkSourceFile({ type: "application/pdf", size: 1000 })).toMatch(/bukan gambar/);
    expect(checkSourceFile({ type: "image/jpeg", size: 0 })).toMatch(/kosong/);
    expect(checkSourceFile({ type: "image/jpeg", size: 30 * 1024 * 1024 })).toMatch(/25 MB/);
    expect(checkSourceSize({ width: 12000, height: 9000 })).toMatch(/Resolusi/);
    expect(checkSourceSize({ width: 0, height: 10 })).toMatch(/tidak bisa dibaca/);
  });
});

describe("kebijakan unggah", () => {
  it("hanya galat jaringan dan 5xx yang dicoba lagi", () => {
    expect(isRetryable({ status: 0 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    for (const status of [400, 401, 403, 409, 413, 415, 422, 429]) expect(isRetryable({ status })).toBe(false);
    expect(retryDelayMs(1)).toBe(1000);
    expect(retryDelayMs(2)).toBe(3000);
  });

  it("setiap kode Worker punya kalimat sendiri", () => {
    expect(describeUploadFailure({ status: 403, code: "owner_only" })).toMatch(/pemilik/);
    expect(describeUploadFailure({ status: 429, code: "daily_limit" })).toMatch(/besok/);
    expect(describeUploadFailure({ status: 429, code: "rate_limited" })).toMatch(/Tunggu/);
    expect(describeUploadFailure({ status: 0 })).toMatch(/internet/);
    expect(describeUploadFailure({ status: 418 })).toMatch(/418/);
  });
});
