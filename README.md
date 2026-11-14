# Book Library

A self-hosted library for the books in your household. One instance holds one
library shared by everyone who lives with you: which books you own and where
they stand, who borrowed what, and what each of you is reading.

> **Early development.** The foundation is in place (accounts, the app shell and
> the API skeleton); cataloguing, loans, reading and statistics are being built.
> Expect breaking changes.

## Quick start with Docker Compose

```sh
docker compose up -d
```

Open <http://localhost:3000>. The first visitor creates the admin account;
after that there is no public sign-up, and the admin adds household members on
the Users page.

All data lives in the `/data` volume (`library.db` and the generated auth
secret). Back up that volume.

### Configuration

| Variable      | Default                      | Purpose                                                                                                                                               |
| ------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`        | `3000`                       | HTTP port                                                                                                                                             |
| `DATA_DIR`    | `./data` (`/data` in Docker) | Where the database lives                                                                                                                              |
| `AUTH_SECRET` | generated into `DATA_DIR`    | Signs sessions                                                                                                                                        |
| `BASE_URL`    | unset                        | Public address, such as `https://books.example.net`. Set it behind an HTTPS reverse proxy; then only that address is accepted and cookies are secure. |

The container runs as the unprivileged `node` user (uid 1000). If you mount a
host directory instead of a named volume, make sure that user can write to it.

## Development

You need [pnpm](https://pnpm.io) 12.18.0 and nothing else: pnpm downloads the
Node.js version pinned in `package.json` (`devEngines.runtime`, currently
26.13.1) during `pnpm install` and runs every script with it. CI and the Docker
image use the same version. Run tools through pnpm (`pnpm exec node …`), not a
globally installed Node.

```sh
pnpm install
pnpm dev          # API on :3000, web app on :5173 with hot reload
```

| Command            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `pnpm dev`         | Server and web app in watch mode; Vite proxies `/api` to the server |
| `pnpm build`       | Production build of the server bundle and the web app               |
| `pnpm lint`        | Biome lint and format check (`pnpm format` fixes)                   |
| `pnpm typecheck`   | TypeScript in every package                                         |
| `pnpm test`        | Vitest unit and integration tests                                   |
| `pnpm e2e`         | Builds, then runs Playwright against the production server          |
| `pnpm db:generate` | Generates a migration after changing `apps/server/src/db/schema.ts` |

Before the first `pnpm e2e`, install the browsers:
`pnpm --filter @book-library/e2e exec playwright install chromium webkit`.

The API is described by OpenAPI at `/api/v1/openapi.json`.

## Project structure

```
apps/server   Hono API, Better Auth, Drizzle schema and migrations (SQLite)
apps/web      React single-page app (Vite, TanStack Router and Query, Tailwind)
e2e           Playwright end-to-end tests
docs/design   Exported design boards, the visual reference for the web app
```

## Licence

[GNU Affero General Public License v3.0](LICENSE).
