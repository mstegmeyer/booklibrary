import { createMiddleware } from "hono/factory";
import { ApiError } from "./errors.ts";
import type { AppEnv } from "./router.ts";

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.user.role !== "admin") {
    throw new ApiError(403, "forbidden", "Only admins can do this");
  }
  await next();
});
