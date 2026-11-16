import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { startMetadataStub } from "./metadata-stub.ts";

const serverMain = join(import.meta.dirname, "../apps/server/dist/main.js");

export const admin = {
  name: "Mara",
  email: "mara@example.com",
  password: "password123",
};

/**
 * Starts the production server on a free port with an empty DATA_DIR and
 * library folder. Its metadata lookups go where `metadataEnv` points: tests
 * pass the stub's, so that they never reach the real catalogues.
 */
export async function startInstance(metadataEnv: Record<string, string>) {
  const dataDir = await mkdtemp(join(tmpdir(), "book-library-e2e-"));
  const libraryDir = join(dataDir, "library");
  const server = spawn(process.execPath, [serverMain], {
    env: {
      ...process.env,
      ...metadataEnv,
      NODE_ENV: "production",
      DATA_DIR: dataDir,
      LIBRARY_DIR: libraryDir,
      PORT: "0",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const port = await new Promise<string>((resolve, reject) => {
    server.once("exit", (code) =>
      reject(new Error(`server exited with ${code}`)),
    );
    server.stdout?.on("data", (chunk: Buffer) => {
      const match = /listening on port (\d+)/.exec(chunk.toString());
      if (match?.[1]) resolve(match[1]);
    });
  });
  return { url: `http://localhost:${port}`, server, dataDir, libraryDir };
}

export async function stopInstance(server: ChildProcess, dataDir: string) {
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  await rm(dataDir, { recursive: true, force: true });
}

/**
 * Every test runs against its own fresh server instance, so tests never share
 * data and may run in any order. `libraryDir` is that server's library folder.
 */
export const test = base.extend<{
  instance: { url: string; libraryDir: string };
  libraryDir: string;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this pattern
  instance: async ({}, use) => {
    const stub = await startMetadataStub();
    const { url, server, dataDir, libraryDir } = await startInstance(stub.env);
    await use({ url, libraryDir });
    await stopInstance(server, dataDir);
    await stub.close();
  },
  baseURL: async ({ instance }, use) => use(instance.url),
  libraryDir: async ({ instance }, use) => use(instance.libraryDir),
});

/** Creates the admin through the setup API; the page is then signed in. */
export async function setupAdmin(page: Page) {
  const res = await page.request.post("/api/v1/setup", { data: admin });
  expect(res.status()).toBe(201);
}

/** Creates a member through the API as the signed-in admin. */
export async function createMember(
  page: Page,
  member = { name: "Ben", email: "ben@example.com", password: "password123" },
) {
  const res = await page.request.post("/api/v1/users", { data: member });
  expect(res.status()).toBe(201);
  return member;
}

export async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: /^(Account|Konto):/ }).click();
}

export { expect };
