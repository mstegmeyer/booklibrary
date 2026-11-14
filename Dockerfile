# Keep the Node version in sync with devEngines.runtime in package.json.
ARG NODE_VERSION=26.13.1

# glibc for the build: pnpm downloads the pinned Node runtime, which has no
# official musl build. The runtime image is Alpine; better-sqlite3 ships
# prebuilt binaries for both and picks the right one when it loads.
FROM node:${NODE_VERSION}-trixie-slim AS build
RUN npm install --global pnpm@12.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
  && pnpm --filter @book-library/server deploy --prod /out/server

FROM node:${NODE_VERSION}-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    LIBRARY_DIR=/library \
    PORT=3000
WORKDIR /app
COPY --from=build /out/server/node_modules apps/server/node_modules
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir /data /library && chown node:node /data /library
USER node
VOLUME /data /library
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --start-interval=2s \
  CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT}/api/v1/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/server/dist/main.js"]
