import { defineConfig } from "vitest/config";

/** firestore.rules di emulator. Butuh Java 21; `npm run test:rules` menyalakannya. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
