# Civy

Civy is a **civics-focused social media website**. It shows each user the legislation that actually
applies to them — bills in their own state legislature plus federal bills in Congress — and gives
them a place to discuss it with the community that legislation affects.

The core rule is **read anywhere, comment where you live**: anyone can read any jurisdiction's bills
and comments, but a user may only comment on bills that are federal or in their home state
(self-declared at signup).

See [`docs/PRD.md`](docs/PRD.md) for the full product model.

## Architecture

Civy is a [moonrepo](https://moonrepo.dev)-managed TypeScript monorepo (Bun for
package management and runtime, Biome for lint + format):

```
civy/
├── .prototools           # pinned toolchain (node, bun, moon)
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
# Install the pinned node, bun, and moon versions (from .prototools)
proto use

# Install workspace dependencies
bun install

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

## Development container

Development happens primarily inside the sandboxed devcontainer in
[`.devcontainer/`](.devcontainer) — Claude Code often runs there remotely, so the container is a real
security boundary, not just a convenience:

- **Isolated Claude credentials.** `CLAUDE_CONFIG_DIR` points at a container-local named volume; the
  host `~/.claude` credentials are never mounted (only `~/.claude/skills` is bound, read-only).
- **Restricted egress.** [`init-firewall.sh`](.devcontainer/init-firewall.sh) runs as root on every
  start (scoped sudo; it can't be disabled from inside). Public internet stays open — Claude needs
  docs, package registries, GitHub, and the ingestion APIs — but private/internal ranges (host, LAN,
  cloud metadata) are blocked. The only exception is the `redis` sibling, permitted on its address
  and queue port alone. Rules are built in a side chain and swapped in, so re-running never opens a
  gap, and any error fails closed (egress dropped) rather than open.
- **No host secrets.** GitHub push auth comes from a read-only host-mounted token, not the host SSH
  keys or a baked-in credential.

**Known residual risk — the project-memory bind.** `~/.claude/projects/<key>/memory` is mounted
**read-write** so memories written inside the container sync back to the host. That makes it the one
channel that is not one-directional: your *host* Claude sessions for this project auto-load those
files, so a compromised container could write instructions there and influence an agent running
outside this sandbox, with your real credentials. This is a deliberate trade for memory sync, not an
oversight — isolation here is strong, not absolute. Mount it `:ro` in
[`docker-compose.yml`](.devcontainer/docker-compose.yml) if you'd rather close it.

Verify the boundary at any time with `bun run dc:verify`, which asserts from inside the container
that public egress works, the metadata address and bridge gateway are blocked, and `redis` is
reachable only on its queue port.

A `redis` sibling service (the ingestion worker's BullMQ backend) comes up alongside the sandbox on
the compose network, reachable as `redis://redis:6379`.

### Bringing it up

Prerequisite: a container runtime (Docker / Rancher Desktop). Drive it with the `dc:*` scripts (or
your IDE's "Reopen in Container"):

```bash
bun run dc:up        # build (first run) + start; applies the firewall, then bun install
bun run dc:shell     # interactive zsh inside the container
bun run dc:claude    # launch Claude Code inside the container
bun run dc:verify    # assert the network boundary holds (see above)
bun run dc:rebuild   # rebuild the image from scratch (after changing .devcontainer/*)
bun run dc:down      # stop + remove the container (image, login, caches, history kept in volumes)
```

Pass Claude flags through after `--`, e.g. `bun run dc:claude -- --dangerously-skip-permissions`.

> Always start/restart through these scripts or "Reopen in Container". A raw `docker start` skips
> `postStartCommand` and so **bypasses the firewall** — `dc:shell` and `dc:claude` re-run it before
> handing over control to cover that case.

### Enable git push (one-time)

Pushing from inside the container uses a fine-grained, single-repo GitHub PAT mounted read-only —
never the host SSH keys. Create it (Settings → Developer settings → fine-grained tokens; scope it to
this repo with Contents: read/write), then:

```bash
mkdir -p ~/.config/civy
install -m 600 /dev/null ~/.config/civy/gh_token   # create it locked down first
(umask 077; cat > ~/.config/civy/gh_token)         # paste the PAT, then Ctrl-D
```

Creating the file with `install -m 600` first (and pasting rather than passing the token as an
argument) avoids a world-readable window and keeps the PAT out of your shell history.

The [`gitconfig`](.devcontainer/gitconfig) credential helper reads it at push time, and `gh` sources
the same file as `GH_TOKEN`. Protect `main` on the GitHub repo so a hijacked session can't force-push.
