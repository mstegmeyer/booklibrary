import { createRoute, z } from "@hono/zod-openapi";
import { requireAdmin } from "../../api/guards.ts";
import { errors, json } from "../../api/openapi.ts";
import { PaginationQuery, page } from "../../api/pagination.ts";
import { createRouter } from "../../api/router.ts";
import { roles } from "../../auth.ts";
import {
  createUser,
  listUsers,
  removeUser,
  setPassword,
  setRole,
} from "./service.ts";

const User = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.enum(roles),
    createdAt: z.number().int(),
  })
  .openapi("User");

export const Password = z.string().min(8).max(128);

export const NewUser = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  password: Password,
});

const UserParams = z.object({ id: z.string() });

const router = createRouter();
router.use(requireAdmin);

export const usersRoutes = router
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Users"],
      summary: "List users",
      request: { query: PaginationQuery },
      responses: { 200: json(page(User), "A page of users"), ...errors },
    }),
    async (c) => c.json(await listUsers(c.var.db, c.req.valid("query")), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Users"],
      summary: "Create a member",
      request: {
        body: { content: { "application/json": { schema: NewUser } } },
      },
      responses: { 201: json(User, "The new user"), ...errors },
    }),
    async (c) => {
      const input = { ...c.req.valid("json"), role: "member" as const };
      return c.json(
        await createUser(c.var.auth, input, c.req.raw.headers),
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/{id}/password",
      tags: ["Users"],
      summary: "Reset a user's password",
      description: "Also ends all of the user's sessions.",
      request: {
        params: UserParams,
        body: {
          content: {
            "application/json": { schema: z.object({ password: Password }) },
          },
        },
      },
      responses: { 204: { description: "Password changed" }, ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { password } = c.req.valid("json");
      await setPassword(c.var.auth, c.req.raw.headers, id, password);
      return c.body(null, 204);
    },
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/{id}/role",
      tags: ["Users"],
      summary: "Change a user's role",
      description: "The last admin cannot be made a member.",
      request: {
        params: UserParams,
        body: {
          content: {
            "application/json": { schema: z.object({ role: z.enum(roles) }) },
          },
        },
      },
      responses: { 200: json(User, "The updated user"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { role } = c.req.valid("json");
      return c.json(await setRole(c.var.db, id, role), 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["Users"],
      summary: "Remove a user",
      description:
        "Deletes the user's reading history; the books and copies they added stay. Admins cannot remove themselves or the last admin.",
      request: { params: UserParams },
      responses: { 204: { description: "User removed" }, ...errors },
    }),
    async (c) => {
      await removeUser(c.var.db, c.var.user.id, c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
