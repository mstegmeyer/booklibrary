import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/app.ts";

const member = {
  name: "Ben",
  email: "ben@example.com",
  password: "password123",
};

describe("users", () => {
  it("lets the admin create a member who can then sign in", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin();

    const res = await request("/api/v1/users", {
      method: "POST",
      token,
      body: member,
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      name: "Ben",
      email: "ben@example.com",
      role: "member",
    });
    expect((await signIn(member.email, member.password)).res.status).toBe(200);
  });

  it("rejects a duplicate email", async () => {
    const { request, setupAdmin } = createTestApp();
    const token = await setupAdmin();
    await request("/api/v1/users", { method: "POST", token, body: member });
    const res = await request("/api/v1/users", {
      method: "POST",
      token,
      body: member,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "conflict" } });
  });

  it("lists users with cursor pagination", async () => {
    const { request, setupAdmin } = createTestApp();
    const token = await setupAdmin();
    for (const name of ["Ben", "Cleo", "Dan"]) {
      await request("/api/v1/users", {
        method: "POST",
        token,
        body: { ...member, name, email: `${name}@example.com` },
      });
    }

    const first = await (
      await request("/api/v1/users?limit=3", { token })
    ).json();
    expect(first.items.map((u: { name: string }) => u.name)).toEqual([
      "Admin",
      "Ben",
      "Cleo",
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await (
      await request(`/api/v1/users?limit=3&cursor=${first.nextCursor}`, {
        token,
      })
    ).json();
    expect(second.items.map((u: { name: string }) => u.name)).toEqual(["Dan"]);
    expect(second.nextCursor).toBeNull();

    const bad = await request("/api/v1/users?cursor=garbage", { token });
    expect(bad.status).toBe(400);
  });

  it("resets a password", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin();
    const { id } = await (
      await request("/api/v1/users", { method: "POST", token, body: member })
    ).json();

    const res = await request(`/api/v1/users/${id}/password`, {
      method: "POST",
      token,
      body: { password: "new-password" },
    });
    expect(res.status).toBe(204);
    expect((await signIn(member.email, member.password)).res.status).toBe(401);
    expect((await signIn(member.email, "new-password")).res.status).toBe(200);

    const missing = await request("/api/v1/users/unknown/password", {
      method: "POST",
      token,
      body: { password: "new-password" },
    });
    expect(missing.status).toBe(404);
  });

  it("forbids members", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin();
    await request("/api/v1/users", { method: "POST", token, body: member });
    const memberToken =
      (await signIn(member.email, member.password)).token ?? "";

    const list = await request("/api/v1/users", { token: memberToken });
    expect(list.status).toBe(403);
    expect(await list.json()).toMatchObject({ error: { code: "forbidden" } });
    const create = await request("/api/v1/users", {
      method: "POST",
      token: memberToken,
      body: { ...member, email: "x@example.com" },
    });
    expect(create.status).toBe(403);
  });
});
