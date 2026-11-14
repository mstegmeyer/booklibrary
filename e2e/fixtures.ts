import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

const serverMain = join(import.meta.dirname, "../apps/server/dist/main.js");

export const admin = {
  name: "Mara",
  email: "mara@example.com",
  password: "password123",
};

/** Starts the production server on a free port with an empty DATA_DIR. */
async function startInstance() {
  const dataDir = await mkdtemp(join(tmpdir(), "book-library-e2e-"));
  const server = spawn(process.execPath, [serverMain], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATA_DIR: dataDir,
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
  return { url: `http://localhost:${port}`, server, dataDir };
}

async function stopInstance(server: ChildProcess, dataDir: string) {
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  await rm(dataDir, { recursive: true, force: true });
}

/**
 * Every test runs against its own fresh server instance, so tests never share
 * data and may run in any order.
 */
export const test = base.extend({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this pattern
  baseURL: async ({}, use) => {
    const { url, server, dataDir } = await startInstance();
    await use(url);
    await stopInstance(server, dataDir);
  },
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
