import { createRoute, z } from "@hono/zod-openapi";
import { errors, json } from "../../api/openapi.ts";
import { createRouter } from "../../api/router.ts";
import {
  createContact,
  deleteContact,
  listContacts,
  renameContact,
} from "./service.ts";

export const ContactName = z.string().trim().min(1).max(100);

/** An existing person by `id`, or a new person created from `name`. */
export const ContactInput = z
  .union([z.object({ id: z.string() }), z.object({ name: ContactName })])
  .openapi("ContactInput");

const Contact = z
  .object({
    id: z.string(),
    name: z.string(),
    lent: z.number().int().openapi({
      description: "How many of our copies the person has right now",
    }),
    borrowed: z.number().int().openapi({
      description: "How many books the person has lent us right now",
    }),
  })
  .openapi("Contact");

const ContactBody = {
  content: {
    "application/json": { schema: z.object({ name: ContactName }) },
  },
};
const ContactParams = z.object({ id: z.string() });

export const contactsRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Contacts"],
      summary: "List people",
      description: "Everyone we lend to or borrow from, sorted by name.",
      responses: {
        200: json(z.object({ items: z.array(Contact) }), "All people"),
        ...errors,
      },
    }),
    async (c) => c.json({ items: await listContacts(c.var.db) }, 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Contacts"],
      summary: "Add a person",
      request: { body: ContactBody },
      responses: { 201: json(Contact, "The new person"), ...errors },
    }),
    async (c) =>
      c.json(await createContact(c.var.db, c.req.valid("json").name), 201),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Contacts"],
      summary: "Rename a person",
      request: { params: ContactParams, body: ContactBody },
      responses: { 200: json(Contact, "The renamed person"), ...errors },
    }),
    async (c) =>
      c.json(
        await renameContact(
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
      tags: ["Contacts"],
      summary: "Delete a person",
      description:
        "Refused with 409 `conflict` while any loan, active or finished, refers to the person.",
      request: { params: ContactParams },
      responses: { 204: { description: "Deleted" }, ...errors },
    }),
    async (c) => {
      await deleteContact(c.var.db, c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
