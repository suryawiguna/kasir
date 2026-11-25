import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Satu kode, banyak klien. `CLIENT=<slug>` memilih `clients/<slug>/client.json`
 * (default `demo`). Isi file itu masuk ke bundle sebagai `__CLIENT__`, jadi
 * setiap build hanya mengenal satu project Firebase. Branding yang bisa diubah
 * pemilik (warna, nama di layar, struk) TIDAK di sini, tetapi di dokumen
 * Firestore `config/shop`, supaya berganti tanpa deploy.
 */
const slug = process.env.CLIENT || "demo";
const clientPath = path.resolve(__dirname, "clients", slug, "client.json");
const client = JSON.parse(readFileSync(clientPath, "utf8"));
if (client.slug !== slug) {
  throw new Error(`clients/${slug}/client.json berisi slug "${client.slug}". Samakan dulu.`);
}

/**
 * Foto produk dan logo dari Worker `kasir-media`: CacheFirst, karena nama file
 * berdasarkan isi (satu nama = satu isi selamanya). Kasir offline tetap
 * melihat foto yang pernah dimuat. `<img crossOrigin="anonymous">` membuat
 * jawabannya berstatus 200 (bukan opaque), jadi boleh di-cache. RegExp, bukan
 * fungsi: konfigurasi ini diserialisasi ke sw.js tanpa variabel di sekitarnya.
 */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mediaCaching = client.workerUrl
  ? [
      {
        urlPattern: new RegExp(`^${escapeRegExp(String(client.workerUrl).replace(/\/+$/, ""))}/v1/`),
        handler: "CacheFirst" as const,
        options: {
          cacheName: `${slug}-media`,
          expiration: { maxEntries: 500, maxAgeSeconds: 90 * 24 * 60 * 60, purgeOnQuotaError: true },
          cacheableResponse: { statuses: [200] },
        },
      },
    ]
  : [];

export default defineConfig({
  define: {
    __CLIENT__: JSON.stringify(client),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt", bukan "autoUpdate": autoUpdate me-reload kasir kapan saja,
      // termasuk di tengah pesanan. features/pwa/appUpdate.ts memasang worker
      // baru saat kasir tidak sibuk.
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: client.name,
        short_name: client.shortName ?? client.name,
        description: `Aplikasi kasir ${client.name}`,
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: mediaCaching,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          const pkg = id.split("node_modules/").pop() ?? "";
          const has = (...names: string[]) => names.some((n) => pkg.startsWith(n + "/"));
          if (has("react", "react-dom", "scheduler")) return "react";
          if (has("firebase", "@firebase", "@grpc", "idb")) return "firebase";
          if (has("lucide-react", "clsx", "sonner")) return "vendors";
        },
      },
    },
  },
});
