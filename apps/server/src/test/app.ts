import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { createApp } from "../app.ts";
import { createAuth } from "../auth.ts";
import { loadConfig } from "../config.ts";
import { openDatabase } from "../db/client.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A fresh app on an empty temporary database. */
export function createTestApp() {
  const dataDir = mkdtempSync(join(tmpdir(), "book-library-test-"));
  dirs.push(dataDir);
  const config = loadConfig({
    DATA_DIR: dataDir,
    LIBRARY_DIR: join(dataDir, "library"),
  });
  const db = openDatabase(config.dataDir);
  const auth = createAuth(db, config);
  const app = createApp(db, auth, {
    libraryDir: config.libraryDir,
  });

  const request = (
    path: string,
    {
      body,
      token,
      ...init
    }: Omit<RequestInit, "body"> & { body?: unknown; token?: string } = {},
  ) =>
    app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** Runs first-run setup and returns the admin's bearer token. */
  const setupAdmin = async (email = "admin@example.com") => {
    const res = await request("/api/v1/setup", {
      method: "POST",
      body: { name: "Admin", email, password: "password123" },
    });
    if (res.status !== 201) throw new Error(`setup failed: ${res.status}`);
    return res.headers.get("set-auth-token") ?? "";
  };

  const signIn = async (email: string, password: string) => {
    const res = await request("/api/auth/sign-in/email", {
      method: "POST",
      body: { email, password },
    });
    return { res, token: res.headers.get("set-auth-token") };
  };

  return {
    app,
    auth,
    db,
    libraryDir: config.libraryDir,
    request,
    setupAdmin,
    signIn,
  };
}
