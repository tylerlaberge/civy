# @civy/api

The Civy CRUD API: a [NestJS](https://nestjs.com) (Express) service that owns the
SQLite database and is the **sole enforcement point for the permissions model**
(PRD §5/§6). The UI only reflects verdicts this API returns.

This scaffold provides a health endpoint, validated env configuration, a global
validation pipe, and a consistent error-response shape. Feature modules
(`src/bills/`, `src/auth/`, `src/comments/`) build on these conventions.

## Tasks

```bash
moon run api:dev         # dev server with hot reload (nest start --watch)
moon run api:build       # production build (nest build -> dist/)
moon run api:typecheck   # tsc --noEmit
moon run api:lint        # biome check
moon run api:test        # vitest run
```

## Environment

Copy `.env.example` to `.env` and adjust. Variables are validated at boot
(`src/config/env.validation.ts`); an invalid value stops the server from starting.

| Variable        | Default                  | Description                                   |
| --------------- | ------------------------ | --------------------------------------------- |
| `PORT`          | `3000`                   | Port the HTTP server listens on.              |
| `DATABASE_PATH` | `./data/civy.sqlite`     | Filesystem path to the SQLite database.       |
| `CORS_ORIGIN`   | `http://localhost:4321`  | Allowed CORS origin (the web app).            |

## Error shape

Every failed request returns a consistent JSON body:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Cannot GET /nope",
  "path": "/nope",
  "timestamp": "2026-07-19T00:00:00.000Z"
}
```
