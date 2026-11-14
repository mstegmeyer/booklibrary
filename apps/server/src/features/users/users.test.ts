import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { book, copy, reading, readingProgress, user } from "../../db/schema.ts";
import { createTestApp } from "../../test/app.ts";
import { removeUser } from "./service.ts";

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

  it("resets a password and ends the user's sessions", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin();
    const { id } = await (
      await request("/api/v1/users", { method: "POST", token, body: member })
    ).json();
    const memberToken =
      (await signIn(member.email, member.password)).token ?? "";

    const res = await request(`/api/v1/users/${id}/password`, {
      method: "POST",
      token,
      body: { password: "new-password" },
    });
    expect(res.status).toBe(204);
    expect(
      (await request("/api/v1/locations", { token: memberToken })).status,
    ).toBe(401);
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
    const me = (await (await request("/api/v1/users", { token })).json())
      .items[0].id;
    const role = await request(`/api/v1/users/${me}/role`, {
      method: "PUT",
      token: memberToken,
      body: { role: "member" },
    });
    expect(role.status).toBe(403);
    const remove = await request(`/api/v1/users/${me}`, {
      method: "DELETE",
      token: memberToken,
    });
    expect(remove.status).toBe(403);
  });

  it("makes a member an admin and takes the role away again", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin();
    const { id } = await (
      await request("/api/v1/users", { method: "POST", token, body: member })
    ).json();
    const memberToken =
      (await signIn(member.email, member.password)).token ?? "";
    const setRole = (role: string, as = token, userId = id) =>
      request(`/api/v1/users/${userId}/role`, {
        method: "PUT",
        token: as,
        body: { role },
      });

    const promoted = await setRole("admin");
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toMatchObject({ id, role: "admin" });
    expect(
      (await request("/api/v1/users", { token: memberToken })).status,
    ).toBe(200);

    expect((await setRole("member")).status).toBe(200);
    expect(
      (await request("/api/v1/users", { token: memberToken })).status,
    ).toBe(403);

    expect((await setRole("owner")).status).toBe(400);
    expect((await setRole("admin", token, "unknown")).status).toBe(404);
  });

  it("never demotes the last admin", async () => {
    const { request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin();
    const users = async () =>
      (await (await request("/api/v1/users", { token })).json()).items;
    const [admin] = await users();
    const demoteAdmin = (as: string) =>
      request(`/api/v1/users/${admin.id}/role`, {
        method: "PUT",
        token: as,
        body: { role: "member" },
      });

    const res = await demoteAdmin(token);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "conflict" } });

    const { id } = await (
      await request("/api/v1/users", { method: "POST", token, body: member })
    ).json();
    await request(`/api/v1/users/${id}/role`, {
      method: "PUT",
      token,
      body: { role: "admin" },
    });
    const secondToken =
      (await signIn(member.email, member.password)).token ?? "";
    expect((await demoteAdmin(secondToken)).status).toBe(200);
    expect(
      (
        await request(`/api/v1/users/${id}/role`, {
          method: "PUT",
          token: secondToken,
          body: { role: "member" },
        })
      ).status,
    ).toBe(409);
  });

  it("removes a user with their reading history but keeps their books", async () => {
    const { db, request, setupAdmin, signIn } = createTestApp();
    const token = await setupAdmin();
    const { id } = await (
      await request("/api/v1/users", { method: "POST", token, body: member })
    ).json();
    const memberToken =
      (await signIn(member.email, member.password)).token ?? "";
    const adminId = db
      .select()
      .from(user)
      .where(eq(user.role, "admin"))
      .get()?.id;

    const added = (
      await (
        await request("/api/v1/books", {
          method: "POST",
          token: memberToken,
          body: { title: "Added by Ben", copy: {} },
        })
      ).json()
    ).id;
    const onlyRead = db
      .insert(book)
      .values({ title: "Only read by Ben" })
      .returning()
      .get().id;
    const sharedRead = db
      .insert(book)
      .values({ title: "Read by both" })
      .returning()
      .get().id;
    const read = (userId: string, bookId: string) =>
      db
        .insert(reading)
        .values({ userId, bookId, status: "reading" })
        .returning()
        .get();
    const session = read(id, added);
    db.insert(readingProgress)
      .values({ readingId: session.id, date: "2026-11-01", page: 12 })
      .run();
    read(id, onlyRead);
    read(id, sharedRead);
    read(adminId ?? "", sharedRead);

    const res = await request(`/api/v1/users/${id}`, {
      method: "DELETE",
      token,
    });
    expect(res.status).toBe(204);

    expect(db.select().from(user).where(eq(user.id, id)).all()).toEqual([]);
    expect(
      db.select().from(reading).where(eq(reading.userId, id)).all(),
    ).toEqual([]);
    expect(db.select().from(readingProgress).all()).toEqual([]);
    expect(
      db
        .select({ id: book.id, createdBy: book.createdBy })
        .from(book)
        .all()
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      [
        { id: added, createdBy: null },
        { id: sharedRead, createdBy: null },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(db.select().from(copy).where(eq(copy.bookId, added)).all()).toEqual([
      expect.objectContaining({ createdBy: null }),
    ]);
    expect(
      (await request("/api/v1/locations", { token: memberToken })).status,
    ).toBe(401);
    expect((await signIn(member.email, member.password)).res.status).toBe(401);

    const missing = await request(`/api/v1/users/${id}`, {
      method: "DELETE",
      token,
    });
    expect(missing.status).toBe(404);
  });

  it("does not let an admin remove their own account", async () => {
    const { db, request, setupAdmin } = createTestApp();
    const token = await setupAdmin();
    const adminId = db.select().from(user).get()?.id;
    const res = await request(`/api/v1/users/${adminId}`, {
      method: "DELETE",
      token,
    });
    expect(res.status).toBe(409);
    expect(await db.$count(user)).toBe(1);
  });

  it("never removes the last admin", async () => {
    const { db, request, setupAdmin } = createTestApp();
    const token = await setupAdmin();
    const { id } = await (
      await request("/api/v1/users", { method: "POST", token, body: member })
    ).json();
    const adminId = db
      .select()
      .from(user)
      .where(eq(user.role, "admin"))
      .get()?.id;
    // The route only lets admins remove others, so with one admin this case
    // cannot be reached over HTTP; the service guards it all the same.
    await expect(removeUser(db, id, adminId ?? "")).rejects.toMatchObject({
      status: 409,
    });
    expect(await db.$count(user)).toBe(2);
  });

  it("leaves no way around these rules through Better Auth's admin API", async () => {
    const { auth, request, setupAdmin } = createTestApp();
    const token = await setupAdmin();
    const endpoints = Object.values(auth.api).filter((endpoint) =>
      endpoint.path?.startsWith("/admin/"),
    );
    expect(endpoints).toHaveLength(15);
    for (const { path, options } of endpoints) {
      const method = [options.method].flat()[0];
      const res = await request(`/api/auth${path}`, {
        method,
        token,
        body: method === "GET" ? undefined : {},
      });
      expect(res.status, path).toBe(404);
    }
  });
});
