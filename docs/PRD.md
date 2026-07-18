# Civy — Product Requirements Document

**Status:** Draft v1 · **Date:** 2026-07-18
**Next step:** break this PRD down into implementation tickets.

## 1. Overview & Vision

Most people have little visibility into the legislation moving through their state legislature or Congress, and few accessible places to discuss it with their neighbors. Legislative websites are hard to navigate, and national social media flattens every conversation into the same feed regardless of where you live.

**Civy** is a civics-focused social media website that shows each user the legislation that actually applies to them — bills in their own state legislature plus federal bills in Congress — and gives them a place to discuss that legislation with the community it affects.

The core principle: **anyone can read any legislation, but you comment where you live.** A Maine resident sees and discusses Maine and federal bills; they can browse California's bills, but only Californians comment there.

**Goal:** make people more informed about the legislation that governs them, and foster discussion within the communities that legislation affects.

## 2. Goals & Non-Goals

### MVP Goals

- Users sign up with an email/password and a self-declared address, which determines their home state (jurisdiction).
- Users see a feed of legislation relevant to them: their state's legislature + Congress.
- Users can browse legislation from any state (read-only outside their own).
- Users can comment on bills in their own state and on federal bills.
- An ingestion pipeline regularly pulls bill data from government sources into the database, starting with **Maine + federal**, architected so additional states can be enabled incrementally.
- The whole system is developable remotely via a sandboxed devcontainer with Claude Code.

### Non-Goals (MVP)

- Address verification (address is taken on trust; no geocoding or identity checks).
- Coverage of all 50 states at launch.
- District-level matching ("your representative", "your district's bills").
- Native mobile apps (responsive web only).
- Rich moderation tooling (basic delete-own-comment and admin removal only).
- Voting, petitions, or contacting legislators.
- Notifications/emails about bill activity.

## 3. Users & Core User Stories

**Primary user:** an ordinary resident who wants to know what their legislature is doing and talk about it — not a policy professional.

- As a visitor, I can sign up with my email, a password, and my address, so the site knows my state.
- As a Maine user, my home feed shows bills moving through the Maine legislature and through Congress.
- As a user, I can open a bill and see its summary, sponsors, current status, history, and a link to the full text on the official source.
- As a Maine user, I can comment on Maine bills and federal bills, and reply to others' comments.
- As a Maine user, I can browse California's legislation and read its discussions, but I cannot comment there.
- As a user, I can search and filter bills (by keyword, chamber, status) within a jurisdiction.
- As a user, I can edit my address in my profile; my jurisdiction (and comment rights) update accordingly.

## 4. Functional Requirements (high level)

### 4.1 Accounts & Authentication

- Email + password authentication, handled by the API (no third-party auth provider).
- Signup collects an address; the state parsed/derived from it becomes the user's **jurisdiction**. Self-declared, unverified in MVP.
- Standard session handling, password hashing, and password change; email verification/reset flows are desirable but may be minimal in MVP.

### 4.2 Legislation Feed & Browsing

- **Home feed:** bills from the user's state legislature and Congress, ordered by recent activity.
- **Jurisdiction browser:** any user can switch to view another state's legislation (read-only) or the federal view.
- Basic search and filters (keyword, chamber, bill status) within a jurisdiction.

### 4.3 Bill Detail

- Title, summary/abstract, sponsors, chamber, current status, and status history/timeline.
- Link out to the authoritative source (state legislature site / congress.gov) for full text.
- Comment thread attached to the bill.

### 4.4 Commenting

- Users can post comments and threaded replies on bills where they have comment rights (see §5).
- Users can delete their own comments; admins can remove any comment.
- Where a user lacks comment rights, the thread is visible but the composer is disabled with an explanation ("Only Maine residents can comment on Maine legislation").

### 4.5 Ingestion

- A worker service regularly pulls bills and status updates from:
  - **Open States API (Plural)** — state legislation (Maine at launch),
  - **Congress.gov API** — federal legislation.
- Runs on a schedule (e.g., a few times daily), upserting bills so status changes flow through without duplicates.
- Per-jurisdiction **source adapters** behind a common interface, so enabling a new state is configuration plus (at most) a thin adapter — not a rewrite.
- Resilient to source downtime and rate limits: retries, backoff, and idempotent job design.

## 5. Permissions Model

Every bill belongs to exactly one **jurisdiction**: a US state (e.g., `us-me`, `us-ca`) or `federal`. Every user has exactly one home state, derived from their self-declared address.

| Action | Rule |
|---|---|
| Read any bill, any jurisdiction | Any user (and unauthenticated visitors) |
| Read comments, any jurisdiction | Any user |
| Comment on a bill | Authenticated, and bill's jurisdiction is `federal` **or** equals the user's home state |
| Delete a comment | Comment author, or admin |

Example: a Maine resident can comment on Maine and federal bills, and can read — but not comment on — California bills. Enforcement lives in the API (not just the UI).

## 6. Architecture (high level)

### Monorepo

Managed with **moonrepo**: `moon` for tasks/orchestration, `proto` (`.prototools`) for toolchain version pinning.

```
civy/
├── .prototools           # pinned toolchain (node, moon, etc.)
├── .moon/                # moon workspace config
├── .devcontainer/        # sandboxed dev environment (see §7)
├── apps/
│   ├── web/              # Astro + React islands (TypeScript)
│   ├── api/              # NestJS CRUD API (TypeScript)
│   └── worker/           # NestJS ingestion worker (TypeScript)
├── packages/             # shared code (types/domain models, db access, config)
└── docs/
```

### Components

- **Web (`apps/web`)** — Astro site with React islands for interactive pieces (comment threads, feed filters, auth forms). Mostly server-rendered pages; talks to the API.
- **API (`apps/api`)** — NestJS. Auth, users, bill read endpoints, comments, permission enforcement. Owns the database.
- **Worker (`apps/worker`)** — NestJS ingestion service. Custom **`@Worker` decorators** that register BullMQ workers/queues under the hood, keeping job code declarative (analogous to how `@Controller` hides HTTP wiring). Scheduled jobs enqueue per-jurisdiction ingestion runs; source adapters (Open States, Congress.gov) fetch and upsert bills.
- **Datastores** — **SQLite** as the application database (MVP simplicity; schema designed to survive a later Postgres migration), **Redis** as the BullMQ queue backing store.
- **Shared packages** — domain types (Bill, Jurisdiction, User, Comment), database schema/client, shared config, so web/api/worker don't drift.

## 7. Development Environment

Development happens primarily **remotely via Claude Code**, inside a **sandboxed devcontainer** modeled on the kino project's setup:

- Docker-compose-based devcontainer (dev services like Redis run as sibling compose services).
- Container-local Claude config volume (`CLAUDE_CONFIG_DIR`) — host credentials and other repos are never exposed to the sandbox.
- Egress **iptables firewall** initialized on container start, allowlisting only required domains (package registries, GitHub, Anthropic, and the legislative data APIs).
- Read-only host binds for shared skills and a fine-grained, single-repo GitHub token; project memory bound read/write via a host-side init script.
- `moon`/`proto` installed in the image so container and host workflows match.

## 8. MVP Milestones

1. **Foundation** — monorepo scaffolding (moon/proto), devcontainer, CI basics.
2. **Data backbone** — schema + shared packages; worker with `@Worker` decorators; ingest Maine + federal bills.
3. **Read experience** — API read endpoints; web feed, jurisdiction browser, bill detail pages (public, read-only).
4. **Accounts & discussion** — auth + address/jurisdiction; commenting with the permissions model enforced.
5. **Polish & pilot** — search/filters, basic admin removal, deploy, seed with real Maine + federal data.

## 9. Open Questions & Future Work

- **Address verification** — when comment rights should become trustworthy, add address validation (e.g., US Census geocoder) and possibly district resolution.
- **State rollout** — order and pace of enabling additional states; monitoring Open States data quality per state.
- **Moderation** — reporting, rate limits, and community guidelines once discussion volume grows.
- **Notifications** — follow a bill, get updates on status changes.
- **Database growth** — criteria for migrating SQLite → Postgres (write concurrency from comments, multi-state data volume).
- **Civility features** — the product's purpose is informed discussion; explore structures (e.g., stance tagging, summaries) that keep threads substantive.
