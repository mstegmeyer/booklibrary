import { describe, expect, it } from "vitest";
import { createAuth, handleAuthRequest } from "../auth.ts";
import { session } from "../db/schema.ts";
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

  it("lets users change their own name", async () => {
    const { request, setupAdmin } = createTestApp();
    const token = await setupAdmin();
    const res = await request("/api/auth/update-user", {
      method: "POST",
      token,
      body: { name: "Mara K." },
    });
    expect(res.status).toBe(200);
    const current = await (
      await request("/api/auth/get-session", { token })
    ).json();
    expect(current.user.name).toBe("Mara K.");
  });

  it("changes the own password only with the current one and ends other sessions", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin("admin@example.com");
    const other = (await signIn("admin@example.com", "password123")).token;
    const change = (currentPassword: string) =>
      request("/api/auth/change-password", {
        method: "POST",
        token,
        body: { currentPassword, newPassword: "another-password" },
      });

    expect((await change("wrong-password")).status).toBe(400);
    expect(
      (await request("/api/v1/users", { token: other ?? "" })).status,
    ).toBe(200);

    const res = await change("password123");
    expect(res.status).toBe(200);
    expect(
      (await request("/api/v1/users", { token: other ?? "" })).status,
    ).toBe(401);
    const { token: kept } = await res.json();
    expect((await request("/api/v1/users", { token: kept })).status).toBe(200);
    expect((await signIn("admin@example.com", "password123")).res.status).toBe(
      401,
    );
    expect(
      (await signIn("admin@example.com", "another-password")).res.status,
    ).toBe(200);
  });

  describe("client address", () => {
    async function signInAddress(
      baseUrl: string | undefined,
      headers: Record<string, string>,
      connectionAddress: string | undefined,
    ) {
      const { db, setupAdmin } = createTestApp();
      await setupAdmin("admin@example.com");
      const auth = createAuth(db, {
        port: 0,
        dataDir: "",
        authSecret: "a-test-secret-that-is-long-enough",
        baseUrl,
      });
      db.delete(session).run();
      const res = await handleAuthRequest(
        auth,
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({
            email: "admin@example.com",
            password: "password123",
          }),
        }),
        connectionAddress,
      );
      expect(res.status).toBe(200);
      return db.select().from(session).get()?.ipAddress;
    }

    it("is the connection's address without BASE_URL", async () => {
      expect(
        await signInAddress(
          undefined,
          { "x-forwarded-for": "203.0.113.9" },
          "192.0.2.7",
        ),
      ).toBe("192.0.2.7");
    });

    it("is the address the reverse proxy forwarded with BASE_URL", async () => {
      expect(
        await signInAddress(
          "http://localhost",
          { "x-forwarded-for": "198.51.100.1, 203.0.113.9" },
          "10.0.0.2",
        ),
      ).toBe("203.0.113.9");
      expect(await signInAddress("http://localhost", {}, "10.0.0.2")).toBe(
        "10.0.0.2",
      );
    });

    it("cannot be set by the client", async () => {
      expect(
        await signInAddress(
          undefined,
          { "x-book-library-client-address": "203.0.113.9" },
          "192.0.2.7",
        ),
      ).toBe("192.0.2.7");
    });
  });
});
