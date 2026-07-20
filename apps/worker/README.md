# @civy/worker

The Civy ingestion worker: a headless [NestJS](https://nestjs.com) application
context (no HTTP server) that will host the BullMQ ingestion workers behind
custom `@Worker` decorators (PRD §6). This scaffold establishes the process
shell and Redis connectivity; queues and source adapters arrive in later stories.

## Tasks

```bash
moon run worker:dev         # dev process with hot reload (nest start --watch)
moon run worker:build       # production build (nest build -> dist/)
moon run worker:typecheck   # tsc --noEmit
moon run worker:lint        # biome check
moon run worker:test        # vitest run
```

## Environment

Copy `.env.example` to `.env` and adjust. Variables are validated at boot
(`src/config/env.validation.ts`); an invalid value stops the process from starting.

| Variable        | Default                  | Description                                     |
| --------------- | ------------------------ | ----------------------------------------------- |
| `REDIS_URL`     | `redis://localhost:6379` | Redis connection URL (BullMQ backing store).    |
| `DATABASE_PATH` | `./data/civy.sqlite`     | Filesystem path to the SQLite database.         |

Needs a reachable Redis. In the devcontainer it runs as a sibling service;
locally use `docker run --rm -p 6379:6379 redis`. If Redis is unreachable at
boot, the worker logs a clear fatal error and exits non-zero (it does not hang).

## Shutdown

The process registers Nest's shutdown hooks, so `SIGINT` (Ctrl-C) or `SIGTERM`
triggers `onModuleDestroy` and closes the Redis connection cleanly before exit.
