import { serveStatic } from "@hono/node-server/serve-static";
import { APIError } from "better-auth/api";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiError, errorBody } from "./api/errors.ts";
import { createPublicRouter, type PublicEnv } from "./api/router.ts";
import type { Auth } from "./auth.ts";
import { version } from "./config.ts";
import type { Db } from "./db/client.ts";
import { features } from "./features/index.ts";
import { instanceRoutes } from "./features/instance/routes.ts";

const requireUser = createMiddleware<PublicEnv>(async (c, next) => {
  if (!c.var.user) throw new ApiError(401, "unauthorized", "Not signed in");
  await next();
});

const codeForStatus: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
};

export function createApp(
  db: Db,
  auth: Auth,
  options: { webRoot?: string } = {},
) {
  const app = createPublicRouter();

  app.use("/api/*", async (c, next) => {
    c.set("db", db);
    c.set("auth", auth);
    await next();
  });
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.use("/api/v1/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    await next();
  });

  app.doc("/api/v1/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Book Library API", version },
  });

  const routes = app
    .route("/api/v1", instanceRoutes)
    .use("/api/v1/*", requireUser)
    .route("/api/v1", features);

  app.notFound((c) => c.json(errorBody("not_found", "Not found"), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message), err.status);
    }
    if (err instanceof APIError || err instanceof HTTPException) {
      const status = (
        err instanceof APIError ? err.statusCode : err.status
      ) as ContentfulStatusCode;
      return c.json(
        errorBody(codeForStatus[status] ?? "bad_request", err.message),
        status,
      );
    }
    console.error(err);
    return c.json(errorBody("internal", "Internal server error"), 500);
  });

  if (options.webRoot) {
    const root = options.webRoot;
    app.use("*", serveStatic({ root }));
    app.get("*", async (c, next) =>
      c.req.path.startsWith("/api/")
        ? next()
        : serveStatic({ root, path: "index.html" })(c, next),
    );
  }

  return routes;
}

export type AppType = ReturnType<typeof createApp>;
