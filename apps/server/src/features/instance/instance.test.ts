import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/app.ts";

describe("instance", () => {
  it("reports health", async () => {
    const { request } = createTestApp();
    const res = await request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  it("requires setup on a fresh instance and not afterwards", async () => {
    const { request, setupAdmin } = createTestApp();
    expect(await (await request("/api/v1/instance")).json()).toMatchObject({
      setupRequired: true,
    });
    await setupAdmin();
    expect(await (await request("/api/v1/instance")).json()).toMatchObject({
      setupRequired: false,
    });
  });

  it("creates a signed-in admin once", async () => {
    const { request } = createTestApp();
    const body = {
      name: "Ada",
      email: "Ada@Example.com",
      password: "password123",
    };
    const res = await request("/api/v1/setup", { method: "POST", body });
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toContain("session_token");

    const session = await request("/api/auth/get-session", {
      headers: { cookie },
    });
    expect(await session.json()).toMatchObject({
      user: { email: "ada@example.com", role: "admin" },
    });

    const again = await request("/api/v1/setup", { method: "POST", body });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({
      error: { code: "conflict", message: "Setup is already complete" },
    });
  });

  it("rejects invalid setup input with 400", async () => {
    const { request } = createTestApp();
    const res = await request("/api/v1/setup", {
      method: "POST",
      body: { name: "", email: "nope", password: "short" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "validation_failed" },
    });
  });

  it("serves the OpenAPI document", async () => {
    const { request } = createTestApp();
    const doc = await (await request("/api/v1/openapi.json")).json();
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/setup",
        "/api/v1/users",
        "/api/v1/users/{id}/password",
      ]),
    );
  });
});
