import { describe, expect, it } from "vitest";
import { canonicalDemoUrl, dataPath, dataPrefix, demoLink, parseDemoPath, withBase } from "./demoId";

describe("parseDemoPath", () => {
  it("slug di /d/ menjadi demo, sisanya route", () => {
    expect(parseDemoPath("/d/aneka-ayam/pesanan")).toEqual({ demoId: "aneka-ayam", base: "/d/aneka-ayam", rest: "/pesanan" });
    expect(parseDemoPath("/d/aneka-ayam")).toEqual({ demoId: "aneka-ayam", base: "/d/aneka-ayam", rest: "/" });
    expect(parseDemoPath("/d/aneka-ayam/")).toEqual({ demoId: "aneka-ayam", base: "/d/aneka-ayam", rest: "/" });
  });

  it("tanpa slug = demo contoh di root", () => {
    expect(parseDemoPath("/")).toEqual({ demoId: "contoh", base: "", rest: "/" });
    expect(parseDemoPath("/pesanan")).toEqual({ demoId: "contoh", base: "", rest: "/pesanan" });
    expect(parseDemoPath("")).toEqual({ demoId: "contoh", base: "", rest: "/" });
  });

  it("slug dikecilkan; slug tidak valid jatuh ke contoh", () => {
    expect(parseDemoPath("/d/Aneka-Ayam/stok").demoId).toBe("aneka-ayam");
    expect(parseDemoPath("/d/a").demoId).toBe("contoh");
    expect(parseDemoPath("/d/").demoId).toBe("contoh");
    expect(parseDemoPath("/d/toko_saya").demoId).toBe("contoh");
    expect(parseDemoPath("/d/%E0%A4%A").demoId).toBe("contoh");
    expect(parseDemoPath(`/d/${"a".repeat(41)}`).demoId).toBe("contoh");
    expect(parseDemoPath(`/d/${"a".repeat(40)}`).demoId).toBe("a".repeat(40));
  });
});

describe("URL", () => {
  it("withBase menambah awalan demo", () => {
    expect(withBase("/d/x1", "/")).toBe("/d/x1");
    expect(withBase("/d/x1", "/pesanan")).toBe("/d/x1/pesanan");
    expect(withBase("", "/pesanan")).toBe("/pesanan");
    expect(withBase("", "/")).toBe("/");
  });

  it("canonicalDemoUrl hanya bila perlu diganti", () => {
    expect(canonicalDemoUrl("/d/aneka-ayam/pesanan")).toBeNull();
    expect(canonicalDemoUrl("/")).toBeNull();
    expect(canonicalDemoUrl("/d/Aneka-Ayam/pesanan")).toBe("/d/aneka-ayam/pesanan");
    expect(canonicalDemoUrl("/d/aneka-ayam/")).toBe("/d/aneka-ayam");
    expect(canonicalDemoUrl("/d/!!/pesanan")).toBe("/");
  });

  it("link demo: contoh di root", () => {
    expect(demoLink("https://kasir-demo.web.app/", "aneka-ayam")).toBe("https://kasir-demo.web.app/d/aneka-ayam");
    expect(demoLink("https://kasir-demo.web.app", "contoh")).toBe("https://kasir-demo.web.app/");
  });
});

describe("path Firestore", () => {
  it("klien biasa: top-level, tidak berubah", () => {
    expect(dataPath(dataPrefix(null), "config", "shop")).toBe("config/shop");
    expect(dataPath(dataPrefix(null), "orders")).toBe("orders");
    expect(dataPath(dataPrefix(null), "inventory", "tkl")).toBe("inventory/tkl");
  });

  it("mode demo: berawalan demos/{id}", () => {
    expect(dataPath(dataPrefix("aneka-ayam"), "config", "shop")).toBe("demos/aneka-ayam/config/shop");
    expect(dataPath(dataPrefix("aneka-ayam"), "orders")).toBe("demos/aneka-ayam/orders");
    expect(dataPath(dataPrefix("contoh"), "inventory", "c1")).toBe("demos/contoh/inventory/c1");
  });
});
