// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Server output (not static): later epics need per-user pages — session-aware
// nav and a personalized feed — so the site is rendered on demand via the
// standalone Node adapter. React islands hydrate only where interactivity is earned.
// Tailwind v4 is wired in as a Vite plugin (no separate Astro integration needed).
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
