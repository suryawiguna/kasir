import { describe, expect, it } from "vitest";
import { accessProblem, parseClaims, usernameToEmail, emailToUsername } from "../auth/claims";
import { effectiveSetup, parseDeviceSetup, suggestDeviceLetter } from "../device/deviceSetup";
import { DEFAULT_FEATURES, parseFeatures } from "../settings/featureFlags";
import { brandForeground, brandRamp, parseShopConfig } from "./shopConfig";

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
    expect(c.receipt).toEqual({ header: ["Jl. A"], footer: ["Terima kasih"], showCustomerName: false });
    expect(c.stockPolicy).toBe("warn");
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
  it("saran huruf", () => {
    expect(suggestDeviceLetter(["A", "B"])).toBe("C");
    expect(suggestDeviceLetter([])).toBe("A");
  });
});

describe("featureFlags", () => {
  it("default untuk yang hilang atau bukan boolean", () => {
    expect(parseFeatures(null)).toEqual(DEFAULT_FEATURES);
    expect(parseFeatures({ multiBranch: true, qris: "ya" })).toEqual({ ...DEFAULT_FEATURES, multiBranch: true });
  });
});
