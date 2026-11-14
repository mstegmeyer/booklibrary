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

Sign-in and the other account requests are rate limited per client address.
Without `BASE_URL` that is the address of the connection. With `BASE_URL` the
server assumes it sits behind a reverse proxy and takes the client address from
the last entry of `X-Forwarded-For`, so the proxy must set or append that
header (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`;
Caddy and Traefik do it by default). Do not expose the server directly when
`BASE_URL` is set, or clients could choose their own address.

Book metadata is looked up in Open Library and the catalogue of the Deutsche
Nationalbibliothek. Google Books needs an API key and is only asked when one is
set. The base URLs exist so tests can point the server at a local stub.

| Variable                  | Default                           | Purpose                      |
| ------------------------- | --------------------------------- | ---------------------------- |
| `GOOGLE_BOOKS_API_KEY`    | unset                             | Enables Google Books lookups |
| `OPEN_LIBRARY_URL`        | `https://openlibrary.org`         | Open Library base URL        |
| `OPEN_LIBRARY_COVERS_URL` | `https://covers.openlibrary.org`  | Open Library cover images    |
| `GOOGLE_BOOKS_URL`        | `https://www.googleapis.com`      | Google Books base URL        |
| `DNB_SRU_URL`             | `https://services.dnb.de/sru/dnb` | DNB SRU catalogue endpoint   |

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

## iOS app

`apps/ios` is a thin native shell for iPhone. You enter your server's address
once; the app then shows that server's own web interface, so it always matches
the server's version and you sign in exactly as in the browser. The app adds a
native barcode scanner that the web interface uses through
`apps/web/src/lib/app-shell.ts`. If the server cannot be reached, the app shows
its connect screen with the reason; "Change server" in the account menu returns
there.

Addresses inside your home network (such as `http://192.168.1.20:3000` or
`http://nas.local:3000`) may use plain HTTP; anything on the internet needs
HTTPS. Without a scheme the app assumes `https://`.

You need Xcode 26 or later. To run it in the simulator, open
`apps/ios/BookLibrary.xcodeproj`, choose an iPhone simulator and press Run, or
build from the command line:

```sh
xcodebuild build -project apps/ios/BookLibrary.xcodeproj -scheme BookLibrary \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

In the simulator, `http://localhost:3000` reaches a server started on the same
Mac with `pnpm build` and `NODE_ENV=production pnpm --filter @book-library/server start`.
The simulator has no camera, so scanning only works on a device.

To put the app on your iPhone, connect it, open the project in Xcode, select
the BookLibrary target, and under Signing & Capabilities choose your own team
(a free Apple account works for personal use). If the bundle identifier
`dev.stegmeyer.booklibrary` is taken for your team, change it there as well.
Do not commit the team: Xcode writes it into `project.pbxproj`, so discard
that change before committing. Then choose your iPhone as the run destination
and press Run; the first time, allow the developer in Settings → General → VPN
& Device Management.

## Project structure

```
apps/server   Hono API, Better Auth, Drizzle schema and migrations (SQLite)
apps/web      React single-page app (Vite, TanStack Router and Query, Tailwind)
apps/ios      iOS app shell (SwiftUI, WKWebView)
e2e           Playwright end-to-end tests
docs/design   Exported design boards, the visual reference for the web app
```

## Licence

[GNU Affero General Public License v3.0](LICENSE).
