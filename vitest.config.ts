// CREATE this file at vitest.config.ts (app root).
// One command runs every test in the project:  npx vitest run
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "extensions/bundle-discount/tests/**/*.test.js",
    ],
    environment: "node",
  },
});
