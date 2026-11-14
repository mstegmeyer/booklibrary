# Book Library

Household book library: Hono API + React SPA in a pnpm monorepo. See README.md
for setup.

## Commands

Everything runs through pnpm, which also provides the pinned Node runtime.

- `pnpm dev` · `pnpm build` · `pnpm lint` (`pnpm format` to fix) · `pnpm typecheck` · `pnpm test` · `pnpm e2e`
- `pnpm db:generate` after editing `apps/server/src/db/schema.ts`; commit the generated SQL in `apps/server/drizzle/`. Migrations run on server start.
- Run one server test file: `pnpm --filter @book-library/server exec vitest run src/features/users`

## Server (`apps/server`)

- One folder per feature: `src/features/<feature>/` with `routes.ts`, `service.ts` and `<feature>.test.ts`. Copy `src/features/users/`.
- Mount the feature's router with one line in `src/features/index.ts`. Everything mounted there is under `/api/v1` and requires a signed-in user (`c.var.user`); use `requireAdmin` from `src/api/guards.ts` for admin-only routes.
- Routes use `createRouter()` from `src/api/router.ts` and `createRoute` from `@hono/zod-openapi`, chained so the web client gets their types. Use `json()` and `errors` from `src/api/openapi.ts` for responses.
- Services take `db` (and `auth` when needed) as arguments; read them from `c.var` in the route.
- Errors: throw `new ApiError(status, code, message)`; every `/api/v1` error is `{ error: { code, message } }`. Zod validation failures become 400 `validation_failed` automatically.
- Lists use cursor pagination: query `PaginationQuery` (`?cursor=&limit=`), response `page(Item)` = `{ items, nextCursor }`, built with `toPage` and `decodeCursor` from `src/api/pagination.ts`.
- Schema conventions: text UUID ids, integer millisecond timestamps (also in API responses), dates as `YYYY-MM-DD` text. Foreign keys restrict deletes except for pure children, so delete dependants deliberately in service code.
- Imports use explicit `.ts` extensions (Node runs the sources directly in dev). Runtime libraries are devDependencies because production uses the bundle in `dist/`; only native modules belong in `dependencies` and in `external` of `rolldown.config.ts`.
- Tests: `createTestApp()` from `src/test/app.ts` gives an app on an empty temporary database plus `request`, `setupAdmin` (returns a bearer token) and `signIn`.

## Web (`apps/web`)

- Routes are files in `src/routes/` (TanStack Router; `routeTree.gen.ts` is generated, not committed). Signed-in pages go under `src/routes/_app/`. Put the feature's components and queries in `src/features/<feature>/`.
- Call the API with `api` and `unwrap` from `src/lib/api.ts` (typed from the server's routes) inside TanStack Query.
- All interface text goes through `react-i18next`. One file per feature and language: `src/locales/en/<feature>.ts` (source, declares its namespace type, see `users.ts`) and `src/locales/de/<feature>.ts` (`satisfies Translation<"<feature>">`). Files are picked up automatically; never put strings for your feature in another feature's file.
- Format dates and numbers with `useFormat()` from `src/lib/format.ts`.
- Use the Tailwind tokens from `src/styles.css` and the primitives in `src/components/ui/`. The visual spec is `docs/design/*.dc.html`.

## End-to-end tests (`e2e`)

- Import `test` from `e2e/fixtures.ts`: each test gets its own production server with an empty `DATA_DIR`, so tests must not depend on each other.
- `setupAdmin(page)` creates the admin through the API and leaves the page signed in; `createMember(page)` adds a member.
- Every spec runs in two projects: desktop Chromium and an iPhone-sized WebKit. Use role-based locators; hidden duplicates (sidebar vs. tab bar) are then ignored.

## Commits

Small logical commits with imperative subject lines. No AI attribution of any kind (no `Co-Authored-By`, no "Generated with" line).
