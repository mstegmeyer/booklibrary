import { createRoute, z } from "@hono/zod-openapi";
import { errors, json } from "../../api/openapi.ts";
import { createRouter } from "../../api/router.ts";
import {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
} from "./service.ts";

const Location = z
  .object({
    id: z.string(),
    parentId: z.string().nullable(),
    name: z.string(),
    path: z.array(z.string()),
    bookCount: z.number().int(),
  })
  .openapi("Location");

const Name = z.string().trim().min(1).max(100);
const LocationParams = z.object({ id: z.string() });

export const locationsRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Locations"],
      summary: "List all locations",
      description:
        "The whole tree in depth-first order. `bookCount` includes the locations inside.",
      responses: {
        200: json(z.object({ items: z.array(Location) }), "All locations"),
        ...errors,
      },
    }),
    async (c) => c.json({ items: await listLocations(c.var.db) }, 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Locations"],
      summary: "Create a location",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                name: Name,
                parentId: z.string().nullable().optional(),
              }),
            },
          },
        },
      },
      responses: { 201: json(Location, "The new location"), ...errors },
    }),
    async (c) =>
      c.json(await createLocation(c.var.db, c.req.valid("json")), 201),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Locations"],
      summary: "Rename or move a location",
      request: {
        params: LocationParams,
        body: {
          content: {
            "application/json": {
              schema: z.object({
                name: Name.optional(),
                parentId: z.string().nullable().optional(),
              }),
            },
          },
        },
      },
      responses: { 200: json(Location, "The changed location"), ...errors },
    }),
    async (c) =>
      c.json(
        await updateLocation(
          c.var.db,
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["Locations"],
      summary: "Delete an empty location",
      description:
        "Fails with 409 `location_not_empty` while copies or other locations are inside.",
      request: { params: LocationParams },
      responses: { 204: { description: "Deleted" }, ...errors },
    }),
    async (c) => {
      await deleteLocation(c.var.db, c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
