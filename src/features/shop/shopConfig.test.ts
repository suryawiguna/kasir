import { describe, expect, it } from "vitest";
import { accessProblem, DEMO_CLAIMS, demoActor, parseClaims, usernameToEmail, emailToUsername } from "../auth/claims";
import { demoDeviceSetup, effectiveSetup, parseDeviceSetup, suggestDeviceLetter } from "../device/deviceSetup";
import { DEFAULT_FEATURES, parseFeatures } from "../settings/featureFlags";
import { brandForeground, brandRamp, contrastRatio, parseShopConfig, TEXT_CONTRAST } from "./shopConfig";

describe("parseShopConfig", () => {
  it("dokumen kosong memberi config utuh", () => {
    const c = parseShopConfig(undefined, "Toko");
    expect(c.name).toBe("Toko");
    expect(c.units.length).toBeGreaterThan(0);
    expect(c.timezone).toBe("Asia/Jakarta");
    expect(c.stockPolicy).toBe("block");
  });

  it("nilai rusak jatuh ke default, nilai benar dipakai", () => {
    const c = parseShopConfig(
      {
        name: "Aneka Ayam",
        brandColor: "merah",
        timezone: "Asia/Makassar",
        units: [{ code: "ikat", label: "ikat", factor: 1, decimals: 0, step: 1 }, { code: "" }],
        receipt: { header: ["Jl. A", 3], showCustomerName: false },
        stockPolicy: "warn",
      },
      "x",
    );
    expect(c.brandColor).toBe("#0f766e");
    expect(c.timezone).toBe("Asia/Makassar");
    expect(c.units.map((u) => u.code)).toEqual(["ikat"]);
    expect(c.receipt).toEqual({ header: ["Jl. A"], footer: ["Terima kasih"], showCustomerName: false, paperWidth: 32 });
    expect(c.stockPolicy).toBe("warn");
  });

  it("logo hanya key unggahan yang sah; logoUrl lama tetap terbaca", () => {
    expect(parseShopConfig({ logo: "brand/logo/3f9a1c0b7d2e4a55.png" }, "x").logo).toBe("brand/logo/3f9a1c0b7d2e4a55.png");
    expect(parseShopConfig({ logo: "https://example.com/logo.png" }, "x").logo).toBeUndefined();
    expect(parseShopConfig({ logo: "products/a/3f9a1c0b7d2e4a55.jpg" }, "x").logo).toBeUndefined();
    expect(parseShopConfig({ logoUrl: "https://example.com/logo.png" }, "x").logoUrl).toBe("https://example.com/logo.png");
  });

  it("lebar kertas hanya 32 atau 48 kolom", () => {
    expect(parseShopConfig({ receipt: { paperWidth: 48 } }, "x").receipt.paperWidth).toBe(48);
    expect(parseShopConfig({ receipt: { paperWidth: 40 } }, "x").receipt.paperWidth).toBe(32);
    expect(parseShopConfig({ receipt: { paperWidth: "48" } }, "x").receipt.paperWidth).toBe(32);
  });
});

describe("brand", () => {
  it("tangga warna memakai warna pilihan di 500", () => {
    const ramp = brandRamp("#DC2626");
    expect(ramp["500"]).toBe("#dc2626");
    expect(Object.keys(ramp)).toHaveLength(10);
    expect(brandForeground("#dc2626")).toBe("#ffffff");
    expect(brandForeground("#fde047")).toBe("#18181b");
  });

  it("teks brand-700 tetap terbaca untuk warna terang", () => {
    for (const color of ["#facc15", "#fde047", "#a3e635", "#67e8f9", "#ffffff"]) {
      const ramp = brandRamp(color);
      expect(contrastRatio(ramp["700"], ramp["50"])).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      expect(contrastRatio(ramp["700"], "#ffffff")).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    }
  });

  it("warna gelap tidak digeser", () => {
    // 700 tetap campuran 25% hitam, sama seperti sebelum penyesuaian kontras.
    expect(brandRamp("#0f766e")["700"]).toBe("#0b5953");
    expect(brandRamp("#dc2626")["700"]).toBe("#a51d1d");
  });
});

describe("claims", () => {
  it("staf wajib punya cabang", () => {
    expect(accessProblem(parseClaims({ admin: true, role: "staff" }))).toBe("staff-without-branch");
    expect(accessProblem(parseClaims({ admin: true, role: "staff", branchId: "tkl" }))).toBeNull();
    expect(accessProblem(parseClaims({ admin: true, role: "owner" }))).toBeNull();
    expect(accessProblem(parseClaims({ admin: true }))).toBe("no-role");
    expect(accessProblem(parseClaims({ role: "owner" }))).toBe("no-admin");
  });
  it("username ↔ email", () => {
    expect(usernameToEmail(" Kasir ", "demo.local")).toBe("kasir@demo.local");
    expect(usernameToEmail("a@b.c", "demo.local")).toBe("a@b.c");
    expect(emailToUsername("kasir@demo.local", "demo.local")).toBe("kasir");
  });
  it("mode demo: pemilik tanpa cabang terkunci, cap audit dari uid", () => {
    expect(accessProblem(DEMO_CLAIMS)).toBeNull();
    expect(DEMO_CLAIMS.role).toBe("owner");
    expect(demoActor("AbC123xyz", "kasir-demo.local")).toBe("tamu-abc123@kasir-demo.local");
  });
});

describe("device setup", () => {
  it("parse aman", () => {
    expect(parseDeviceSetup('{"branchId":"tkl","deviceLetter":"A"}')).toEqual({ branchId: "tkl", deviceLetter: "A" });
    expect(parseDeviceSetup('{"branchId":"tkl","deviceLetter":"a"}')).toBeNull();
    expect(parseDeviceSetup("{rusak")).toBeNull();
    expect(parseDeviceSetup(null)).toBeNull();
  });
  it("staf terkunci ke cabang claim", () => {
    const stored = { branchId: "pkm", deviceLetter: "A" };
    expect(effectiveSetup(stored, "staff", "tkl", ["tkl", "pkm"])).toBeNull();
    expect(effectiveSetup(stored, "staff", "pkm", ["tkl", "pkm"])).toEqual(stored);
    expect(effectiveSetup(stored, "owner", null, ["tkl", "pkm"])).toEqual(stored);
    expect(effectiveSetup(stored, "owner", null, ["tkl"])).toBeNull(); // cabang diarsip
  });
  it("mode demo: setup otomatis", () => {
    expect(demoDeviceSetup(null, ["c1", "c2"], 0)).toEqual({ branchId: "c1", deviceLetter: "A" });
    expect(demoDeviceSetup(null, ["c1", "c2"], 0.999)).toEqual({ branchId: "c1", deviceLetter: "Z" });
    expect(demoDeviceSetup(null, ["c1"], 1)).toEqual({ branchId: "c1", deviceLetter: "Z" });
    // Setup yang masih berlaku tidak diganti (pindah cabang dari bilah demo).
    expect(demoDeviceSetup({ branchId: "c2", deviceLetter: "K" }, ["c1", "c2"], 0)).toEqual({ branchId: "c2", deviceLetter: "K" });
    // Cabang diarsip: pindah ke cabang aktif pertama, huruf tetap.
    expect(demoDeviceSetup({ branchId: "c9", deviceLetter: "K" }, ["c1"], 0)).toEqual({ branchId: "c1", deviceLetter: "K" });
    expect(demoDeviceSetup(null, [], 0.5)).toBeNull();
  });
  it("saran huruf", () => {
    expect(suggestDeviceLetter(["A", "B"])).toBe("C");
    expect(suggestDeviceLetter([])).toBe("A");
  });
});

describe("featureFlags", () => {
  it("default untuk yang hilang atau bukan boolean", () => {
    expect(parseFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures({ weightSales: true, qris: "ya", multiBranch: true })).toEqual({ ...DEFAULT_FEATURES, weightSales: true });
  });
});
