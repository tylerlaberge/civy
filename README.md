# Civy

Civy is a **civics-focused social media website**. It shows each user the legislation that actually
applies to them — bills in their own state legislature plus federal bills in Congress — and gives
them a place to discuss it with the community that legislation affects.

The core rule is **read anywhere, comment where you live**: anyone can read any jurisdiction's bills
and comments, but a user may only comment on bills that are federal or in their home state
(self-declared at signup).

See [`docs/PRD.md`](docs/PRD.md) for the full product model.

## Architecture

Civy is a [moonrepo](https://moonrepo.dev)-managed TypeScript monorepo:

```
civy/
├── .prototools           # pinned toolchain (node, pnpm, moon)
├── .moon/                # moon workspace + task configuration
├── apps/
│   ├── web/              # Astro + React islands (server-rendered UI)
│   ├── api/              # NestJS CRUD API (owns the database, enforces permissions)
│   └── worker/           # NestJS ingestion worker (BullMQ, source adapters)
├── packages/             # shared code (domain types, db schema/client, config)
└── docs/                 # product docs (PRD)
```

> The `apps/*` and `packages/*` projects are added incrementally by later stories; this scaffold
> establishes the workspace they plug into.

## Getting started

Prerequisites: [proto](https://moonrepo.dev/proto) (installs the pinned toolchain).

```bash
# Install the pinned node, pnpm, and moon versions (from .prototools)
proto use

# Install workspace dependencies
pnpm install

# Lint + typecheck + test + build across the workspace
moon check --all
```

### Common tasks

```bash
moon check --all            # lint + typecheck + test + build across the workspace
moon run <project>:dev      # dev server for a project (e.g. web, api, worker)
moon run <project>:test     # tests for one project
moon ci                     # what CI runs (affected-aware)
```

Development happens primarily inside the sandboxed devcontainer in `.devcontainer/`.
