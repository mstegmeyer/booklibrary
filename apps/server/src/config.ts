import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import packageJson from "../package.json" with { type: "json" };

export const version = packageJson.version;

// Resolved from this module, which sits one level below the package root both
// as src/config.ts and inside the production bundle dist/main.js.
export const migrationsFolder = join(import.meta.dirname, "../drizzle");
export const webRoot = join(import.meta.dirname, "../../web/dist");

export type Config = {
  port: number;
  dataDir: string;
  /** Where e-book files live; may be a synced or network folder. */
  libraryDir: string;
  authSecret: string;
  baseUrl: string | undefined;
};

export function loadConfig(env = process.env): Config {
  const dataDir = resolve(env.DATA_DIR ?? "./data");
  mkdirSync(dataDir, { recursive: true });
  const libraryDir = resolve(env.LIBRARY_DIR ?? "./library");
  mkdirSync(libraryDir, { recursive: true });
  return {
    port: Number(env.PORT ?? 3000),
    dataDir,
    libraryDir,
    authSecret: env.AUTH_SECRET || persistedSecret(dataDir),
    baseUrl: env.BASE_URL || undefined,
  };
}

function persistedSecret(dataDir: string): string {
  const file = join(dataDir, "auth-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
