# @civy/web

The Civy user-facing website: an [Astro](https://astro.build) site (server
output, Node adapter) with [React](https://react.dev) islands for the pieces that
are genuinely interactive and [Tailwind CSS](https://tailwindcss.com) (v4) for
styling. Most pages are server-rendered; islands are earned.

## Tasks

```bash
moon run web:dev         # local dev server (astro dev)
moon run web:build       # production build (astro build)
moon run web:typecheck   # astro check
moon run web:lint        # biome check
moon run web:test        # vitest run
```

## Environment

Copy `.env.example` to `.env` and adjust. Astro exposes `PUBLIC_`-prefixed
variables to server and client code.

| Variable         | Description                    |
| ---------------- | ------------------------------ |
| `PUBLIC_API_URL` | Base URL of the Civy API.      |
