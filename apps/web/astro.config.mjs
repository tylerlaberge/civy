// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField } from "astro/config";

// Server output (not static): later epics need per-user pages — session-aware
// nav and a personalized feed — so the site is rendered on demand via the
// standalone Node adapter. React islands hydrate only where interactivity is earned.
// Tailwind v4 is wired in as a Vite plugin (no separate Astro integration needed).
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  // Env is typed and validated here. Server-context vars are read at request
  // time (not inlined at build), so a deployed server can be re-pointed at a
  // different API per environment without a rebuild — this is the pattern the
  // rest of the app follows for config.
  env: {
    schema: {
      API_URL: envField.string({
        context: "server",
        access: "public",
        optional: true,
        default: "http://localhost:3000",
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
