import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS depends on emitted decorator metadata (reflect-metadata). Vitest's
// default esbuild transform drops it, so compile tests with SWC, which honors
// the tsconfig legacy-decorator + metadata settings.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.{test,spec}.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  plugins: [swc.vite()],
});
