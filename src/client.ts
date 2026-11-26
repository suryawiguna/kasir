import type { ClientConfig } from "./domain/types";

declare const __CLIENT__: ClientConfig;

/**
 * Konfigurasi klien yang dibangun (clients/<slug>/client.json), disuntik saat
 * build oleh vite.config.ts. Modul murni yang dites tidak boleh mengimpor ini.
 */
export const CLIENT: ClientConfig = __CLIENT__;
