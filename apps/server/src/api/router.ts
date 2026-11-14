import { OpenAPIHono, type z } from "@hono/zod-openapi";
import type { Auth } from "../auth.ts";
import type { Db } from "../db/client.ts";
import { errorBody } from "./errors.ts";

type Session = Auth["$Infer"]["Session"];
export type SessionUser = Session["user"];

type Services = { db: Db; auth: Auth };

export type PublicEnv = {
  Variables: Services & { user: SessionUser | null };
};

/** Routes behind the session guard: `c.var.user` is always set. */
export type AppEnv = {
  Variables: Services & { user: SessionUser };
};

const defaultHook = (
  result: { success: true } | { success: false; error: z.ZodError },
  c: { json: (body: unknown, status: 400) => Response },
) => {
  if (!result.success) {
    const message = result.error.issues
      .map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
      )
      .join("; ");
    return c.json(errorBody("validation_failed", message), 400);
  }
};

export const createRouter = () => new OpenAPIHono<AppEnv>({ defaultHook });

export const createPublicRouter = () =>
  new OpenAPIHono<PublicEnv>({ defaultHook });
