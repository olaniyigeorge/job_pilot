import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Config loads read from disk, so keep runs isolated and serial.
    fileParallelism: false,
  },
});
