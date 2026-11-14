import { describe, expect, it } from "vitest";
import { createTestApp } from "../test/app.ts";

describe("auth", () => {
  it("has no public sign-up", async () => {
    const { request } = createTestApp();
    const res = await request("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Eve", email: "eve@example.com", password: "password123" },
    });
    expect(res.ok).toBe(false);
    expect(
      (await (await request("/api/v1/instance")).json()).setupRequired,
    ).toBe(true);
  });

  it("signs in with email and password and accepts the bearer token", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    await setupAdmin("admin@example.com");
    expect(
      (await signIn("admin@example.com", "wrong-password")).res.status,
    ).toBe(401);

    const { res, token } = await signIn("admin@example.com", "password123");
    expect(res.status).toBe(200);
    expect(
      (await request("/api/v1/users", { token: token ?? "" })).status,
    ).toBe(200);
  });

  it("rejects /api/v1 requests without a session", async () => {
    const { request } = createTestApp();
    const res = await request("/api/v1/users");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Not signed in" },
    });
  });

  it("answers unknown API paths with the error shape", async () => {
    const { request, setupAdmin } = createTestApp();
    const token = await setupAdmin();
    const res = await request("/api/v1/nope", { token });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });
});
