# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Civy is a **civics-focused social media website**: users see the legislation that actually applies to
them — bills in their own state legislature plus federal bills in Congress — and discuss it with the
community it affects. The core rule is **read anywhere, comment where you live**: anyone can read any
jurisdiction's bills and comments, but a user may only comment on bills that are federal or in their
home state (self-declared address at signup). An ingestion pipeline keeps bills current by pulling
from the Open States API (state legislation; Maine at launch) and the Congress.gov API (federal).

Read [`docs/PRD.md`](../docs/PRD.md) for the full product model — the permissions model (§5) and the
architecture (§6) drive nearly every feature decision.

**Current state: the repository is bootstrapped but the code is not built yet.** What exists today is
the PRD and the backlog as **GitHub issues** in
https://github.com/tylerlaberge/civy — **epics** (parent issues, `epic` label) with their
**stories** as native sub-issues (`story` label). Work is organized and tracked through those issues.
When asked to implement something, find its story/epic issue first and don't assume not-yet-built
apps or packages exist.

The intended architecture (PRD §6) is a **moonrepo-managed TypeScript monorepo**:

- **`apps/web`** — Astro + React islands. Mostly server-rendered pages; islands only for genuinely
  interactive pieces (feed filters, comment threads, auth forms).
- **`apps/api`** — NestJS CRUD API. Owns the SQLite database and is the **sole enforcement point for
  the permissions model** — the UI only reflects verdicts the API returns (e.g., `canComment`).
- **`apps/worker`** — NestJS ingestion service (headless, no HTTP). Custom **`@Worker` decorators**
  register BullMQ queues/workers under the hood (Redis-backed). Per-jurisdiction
  **`LegislationSource` adapters** behind a common interface make adding a state a registry entry,
  not a rewrite.
- **`packages/types`** — shared domain model (Jurisdiction, Bill, User, Comment, DTOs) so the three
  apps never drift. **`packages/db`** — SQLite schema, migrations (Drizzle), typed client shared by
  api and worker.

## Commands

Tooling: **moon** for task orchestration, **proto** (`.prototools`) for toolchain pinning
(`proto use` installs pinned versions). Once the projects exist, the common tasks are:

```bash
moon check --all            # lint + typecheck + test + build across the workspace
moon run web:dev            # Astro dev server
moon run api:dev            # NestJS API with hot reload
moon run worker:dev         # ingestion worker (needs Redis)
moon run <project>:test     # tests for one project
moon ci                     # what CI runs (affected-aware)
```

Development happens primarily inside the sandboxed devcontainer in `.devcontainer/` (compose-based:
Claude sandbox + Redis sibling, egress firewall, isolated Claude credentials).

## Architecture & conventions

- **Permissions live in one place.** "May user U comment on bill B" is a single shared function
  (`PermissionsService`) used by guards, DTO verdicts, and admin logic — never re-implemented
  client-side. The API enforces; the UI explains.
- **Space for growth by registry, not rewrite.** New states enter through the jurisdiction registry +
  `LegislationSource` adapters. Keep adapters jurisdiction-agnostic (Open States serves all states
  with per-jurisdiction config).
- **Idempotent ingestion.** Bills upsert on `(jurisdiction, external_id)`; status history is
  append-only and deduplicated; cursors advance only on success. Re-running any ingestion must be
  safe.
- **SQLite now, Postgres-shaped.** Keep schema/types/defaults portable (no SQLite-only tricks); WAL
  mode is what lets API reads and worker writes coexist — API and worker must share one filesystem.
- **Islands are earned.** Prefer Astro server rendering with URL-as-state; add a React island only
  when real interactivity demands it.
- **Shared types are the contract.** API DTOs, status enums, and domain models come from
  `packages/types`; don't fork shapes locally in an app.
- **Backlog is GitHub issues.** Epics are parent issues (`epic` label); stories are their sub-issues
  (`story` label); workflow state is tracked with the `dev` / `review` / `done` labels on the issue.
  Reference the relevant issue when implementing, and keep GitHub's auto-assigned issue number as the
  identifier — don't introduce a separate numbering scheme.
