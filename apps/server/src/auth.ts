import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { admin, bearer } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import * as schema from "./db/schema.ts";

export const roles = ["admin", "member"] as const;
export type Role = (typeof roles)[number];

// Better Auth takes the client address for rate limiting from a request
// header. The server sets this one on every auth request, replacing any value
// a client sent.
const clientAddressHeader = "x-book-library-client-address";

export function createAuth(db: Db, config: Config) {
  return betterAuth({
    secret: config.authSecret,
    // Without BASE_URL the base URL is inferred from each request, so the
    // instance works under whatever address the household uses. Secure cookies
    // then follow BASE_URL: forcing them would break plain-HTTP LAN setups.
    baseURL: config.baseUrl,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    // The users API replaces these: it guards the last admin and ends the
    // sessions of a user whose password was reset.
    disabledPaths: [
      "/admin/set-role",
      "/admin/update-user",
      "/admin/set-user-password",
      "/admin/remove-user",
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/change-password") {
          return {
            context: { body: { ...ctx.body, revokeOtherSessions: true } },
          };
        }
      }),
    },
    plugins: [
      admin({
        roles: { admin: adminAc, member: userAc },
        defaultRole: "member",
        adminRoles: ["admin"],
      }),
      bearer(),
    ],
    advanced: {
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: [clientAddressHeader] },
      ...(config.baseUrl ? {} : { useSecureCookies: false }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Passes a request to Better Auth together with the client's address. With
 * BASE_URL set the server is behind a reverse proxy, so the connection comes
 * from the proxy and the client's address is the one the proxy appended to
 * X-Forwarded-For.
 */
export function handleAuthRequest(
  auth: Auth,
  request: Request,
  connectionAddress: string | undefined,
) {
  const forwarded = auth.options.baseURL
    ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    : undefined;
  const address = forwarded || connectionAddress;
  if (address) request.headers.set(clientAddressHeader, address);
  else request.headers.delete(clientAddressHeader);
  return auth.handler(request);
}
