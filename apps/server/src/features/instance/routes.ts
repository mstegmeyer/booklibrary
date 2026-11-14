import { createRoute, z } from "@hono/zod-openapi";
import { ApiError } from "../../api/errors.ts";
import { errors, json } from "../../api/openapi.ts";
import { createPublicRouter } from "../../api/router.ts";
import { version } from "../../config.ts";
import { NewUser } from "../users/routes.ts";
import { countUsers, createUser } from "../users/service.ts";

// Serialises setup requests so two visitors cannot both become admin.
let setupRunning = false;
const setupDone = () =>
  new ApiError(409, "conflict", "Setup is already complete");

export const instanceRoutes = createPublicRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/health",
      tags: ["Instance"],
      summary: "Health check",
      responses: {
        200: json(
          z.object({ status: z.literal("ok"), version: z.string() }),
          "The server is up",
        ),
      },
    }),
    (c) => c.json({ status: "ok" as const, version }, 200),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/instance",
      tags: ["Instance"],
      summary: "Instance information",
      responses: {
        200: json(
          z.object({ setupRequired: z.boolean(), version: z.string() }),
          "Whether the first admin still has to be created",
        ),
      },
    }),
    async (c) =>
      c.json(
        { setupRequired: (await countUsers(c.var.db)) === 0, version },
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/setup",
      tags: ["Instance"],
      summary: "Create the first admin and sign in",
      description:
        "Works only while no user exists. Sets the session cookie and returns a bearer token in the `set-auth-token` header.",
      request: {
        body: { content: { "application/json": { schema: NewUser } } },
      },
      responses: {
        201: json(z.object({ id: z.string() }), "The admin was created"),
        ...errors,
      },
    }),
    async (c) => {
      const input = c.req.valid("json");
      if (setupRunning) throw setupDone();
      setupRunning = true;
      try {
        if ((await countUsers(c.var.db)) > 0) throw setupDone();
        const admin = await createUser(c.var.auth, { ...input, role: "admin" });
        const { headers } = await c.var.auth.api.signInEmail({
          body: { email: input.email, password: input.password },
          returnHeaders: true,
        });
        for (const cookie of headers.getSetCookie()) {
          c.header("set-cookie", cookie, { append: true });
        }
        c.header("set-auth-token", headers.get("set-auth-token") ?? "");
        return c.json({ id: admin.id }, 201);
      } finally {
        setupRunning = false;
      }
    },
  );
