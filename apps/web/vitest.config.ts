import { getViteConfig } from "astro/config";

// getViteConfig reuses Astro's resolved Vite pipeline (React JSX, aliases) so
// component tests run against the same transform the app uses.
export default getViteConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
