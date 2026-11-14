import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import * as schema from "./db/schema.ts";

export const roles = ["admin", "member"] as const;
export type Role = (typeof roles)[number];

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
      ...(config.baseUrl ? {} : { useSecureCookies: false }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
