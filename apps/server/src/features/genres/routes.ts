import { createRoute, z } from "@hono/zod-openapi";
import { errors, json } from "../../api/openapi.ts";
import { createRouter } from "../../api/router.ts";
import {
  createGenre,
  deleteGenre,
  listGenres,
  renameGenre,
} from "./service.ts";

export const GenreRef = z
  .object({
    id: z.string(),
    key: z.string().nullable().openapi({
      description:
        "Set for a built-in genre, which clients show in their own language while `name` is null",
    }),
    name: z.string().nullable().openapi({
      description: "The name people gave it; null for an unrenamed built-in",
    }),
  })
  .openapi("GenreRef");

const Genre = GenreRef.extend({ bookCount: z.number().int() }).openapi("Genre");

const Name = z.string().trim().min(1).max(100);
const NameBody = {
  content: { "application/json": { schema: z.object({ name: Name }) } },
};
const GenreParams = z.object({ id: z.string() });

export const genresRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Genres"],
      summary: "List all genres",
      description: "`bookCount` counts every book with the genre.",
      responses: {
        200: json(z.object({ items: z.array(Genre) }), "All genres"),
        ...errors,
      },
    }),
    (c) => c.json({ items: listGenres(c.var.db) }, 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Genres"],
      summary: "Add a genre",
      description:
        "A name another added or renamed genre has, ignoring case, gives 409 `genre_exists`.",
      request: { body: NameBody },
      responses: { 201: json(Genre, "The new genre"), ...errors },
    }),
    (c) => c.json(createGenre(c.var.db, c.req.valid("json").name), 201),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Genres"],
      summary: "Rename a genre",
      description:
        "A renamed built-in genre keeps its `key`. A name another added or renamed genre has, ignoring case, gives 409 `genre_exists`.",
      request: { params: GenreParams, body: NameBody },
      responses: { 200: json(Genre, "The renamed genre"), ...errors },
    }),
    (c) =>
      c.json(
        renameGenre(
          c.var.db,
          c.req.valid("param").id,
          c.req.valid("json").name,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["Genres"],
      summary: "Delete a genre",
      description:
        "Its books are left without a genre. A deleted built-in genre does not come back.",
      request: { params: GenreParams },
      responses: { 204: { description: "Deleted" }, ...errors },
    }),
    (c) => {
      deleteGenre(c.var.db, c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
