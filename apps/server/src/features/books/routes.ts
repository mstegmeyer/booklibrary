import { createRoute, z } from "@hono/zod-openapi";
import { ApiError } from "../../api/errors.ts";
import { ErrorSchema, errors, json } from "../../api/openapi.ts";
import { PaginationQuery, page } from "../../api/pagination.ts";
import { createRouter } from "../../api/router.ts";
import { bookFormats, readingStatuses } from "../../db/schema.ts";
import { readCover, saveCover } from "./covers.ts";
import { normalizeIsbn } from "./isbn.ts";
import {
  addCopy,
  createBook,
  getBook,
  librarySummary,
  listLibrary,
  removeCopy,
  updateBook,
  updateCopy,
} from "./service.ts";

const maxCoverBytes = 10 * 1024 * 1024;

const Isbn = z
  .string()
  .transform((value, ctx) => {
    const isbn = normalizeIsbn(value);
    if (isbn) return isbn;
    ctx.addIssue({ code: "custom", message: `Invalid ISBN: ${value}` });
    return z.NEVER;
  })
  .openapi({
    description: "ISBN-10 or ISBN-13, hyphens allowed; stored as ISBN-13",
  });

const Text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const BookFields = z.object({
  title: z.string().trim().min(1).max(500),
  subtitle: Text(500),
  authors: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  description: Text(10_000),
  pageCount: z.number().int().min(1).max(100_000).nullable().optional(),
  publishedYear: z.number().int().min(0).max(9999).nullable().optional(),
  language: Text(50),
  isbns: z.array(Isbn).max(20).optional(),
});

const CopyFields = z.object({
  locationId: z.string().nullable().optional(),
  format: z.enum(bookFormats).nullable().optional(),
  note: Text(500),
});

const IsbnTaken = z
  .object({
    error: z.object({
      code: z.literal("isbn_taken"),
      message: z.string(),
      bookId: z.string(),
    }),
  })
  .openapi("IsbnTaken");

const conflictResponses = {
  ...errors,
  409: {
    content: {
      "application/json": { schema: z.union([IsbnTaken, ErrorSchema]) },
    },
    description: "An ISBN belongs to another book (`isbn_taken`)",
  },
};

const ReadingSummary = z.object({
  status: z.enum(readingStatuses),
  progress: z.number().int().nullable(),
});

const LibraryItem = z
  .object({
    id: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    pageCount: z.number().int().nullable(),
    coverUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    copyCount: z.number().int(),
    availability: z.enum(["shelf", "lent"]).openapi({
      description: "`shelf` when at least one copy is not lent out",
    }),
    locationPath: z.array(z.string()).openapi({
      description: "Where the first available copy is; empty if not placed",
    }),
    lentTo: z.string().nullable().openapi({
      description: "Who has the first copy when every copy is lent out",
    }),
    reading: ReadingSummary.nullable().openapi({
      description: "The signed-in user's current reading of the book",
    }),
  })
  .openapi("LibraryItem");

const Copy = z
  .object({
    id: z.string(),
    format: z.enum(bookFormats).nullable(),
    note: z.string().nullable(),
    location: z
      .object({ id: z.string(), path: z.array(z.string()) })
      .nullable(),
    loan: z
      .object({ contactName: z.string(), startedOn: z.string() })
      .nullable(),
  })
  .openapi("Copy");

const Book = z
  .object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    authors: z.array(z.string()),
    description: z.string().nullable(),
    pageCount: z.number().int().nullable(),
    publishedYear: z.number().int().nullable(),
    language: z.string().nullable(),
    isbns: z.array(z.string()),
    coverUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    metadataSource: z.string().nullable(),
    createdAt: z.number().int(),
    createdBy: z.object({ id: z.string(), name: z.string() }),
    copies: z.array(Copy),
  })
  .openapi("Book");

const LibraryQuery = PaginationQuery.extend({
  q: z.string().optional(),
  locationId: z.string().optional().openapi({
    description: "Only books with a copy here or in a location inside",
  }),
  availability: z.enum(["shelf", "lent"]).optional(),
  reading: z
    .enum([...readingStatuses, "none"])
    .optional()
    .openapi({
      description: "The signed-in user's current reading status",
    }),
  sort: z.enum(["added", "title", "author"]).default("added"),
});

const BookParams = z.object({ id: z.string() });
const CopyParams = z.object({ id: z.string(), copyId: z.string() });

const router = createRouter();

// Images are not JSON, so this route stays outside the typed client.
router.get("/:id/cover", async (c) => {
  const size = c.req.query("size") === "thumb" ? "thumb" : "full";
  const image = await readCover(c.var.db, c.req.param("id"), size);
  return c.body(new Uint8Array(image), 200, {
    "content-type": "image/jpeg",
    // Every new cover gets a new URL, so a cached one never goes stale.
    "cache-control": "private, max-age=31536000, immutable",
  });
});

export const booksRoutes = router
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Books"],
      summary: "List the library",
      description:
        "Books the household owns (at least one copy), filtered and sorted.",
      request: { query: LibraryQuery },
      responses: {
        200: json(page(LibraryItem), "A page of books"),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listLibrary(c.var.db, c.var.user.id, c.req.valid("query")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/summary",
      tags: ["Books"],
      summary: "Library figures",
      responses: {
        200: json(
          z.object({
            books: z.number().int(),
            places: z.number().int(),
            lentOut: z.number().int(),
          }),
          "Owned books, top-level locations and copies lent out",
        ),
        ...errors,
      },
    }),
    async (c) => c.json(await librarySummary(c.var.db), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Books"],
      summary: "Create a book",
      request: {
        body: {
          content: {
            "application/json": {
              schema: BookFields.extend({ copy: CopyFields.optional() }),
            },
          },
        },
      },
      responses: { 201: json(Book, "The new book"), ...conflictResponses },
    }),
    async (c) => {
      const id = createBook(c.var.db, c.var.user.id, c.req.valid("json"));
      return c.json(await getBook(c.var.db, id), 201);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["Books"],
      summary: "Get a book with its copies",
      request: { params: BookParams },
      responses: { 200: json(Book, "The book"), ...errors },
    }),
    async (c) => c.json(await getBook(c.var.db, c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Books"],
      summary: "Edit a book's metadata and ISBNs",
      description: "`isbns`, when given, replaces the whole list.",
      request: {
        params: BookParams,
        body: {
          content: { "application/json": { schema: BookFields.partial() } },
        },
      },
      responses: { 200: json(Book, "The changed book"), ...conflictResponses },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      updateBook(c.var.db, id, c.req.valid("json"));
      return c.json(await getBook(c.var.db, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/{id}/cover",
      tags: ["Books"],
      summary: "Upload a cover image",
      description: `Replaces the cover. Any common image format up to ${maxCoverBytes / 1024 / 1024} MB.`,
      request: {
        params: BookParams,
        body: {
          content: {
            "multipart/form-data": {
              schema: z.object({
                file: z
                  .instanceof(File)
                  .openapi({ type: "string", format: "binary" }),
              }),
            },
          },
        },
      },
      responses: { 200: json(Book, "The book with its new cover"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { file } = c.req.valid("form");
      if (file.size > maxCoverBytes) {
        throw new ApiError(400, "bad_request", "The image is too large");
      }
      await saveCover(c.var.db, id, new Uint8Array(await file.arrayBuffer()));
      return c.json(await getBook(c.var.db, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/{id}/copies",
      tags: ["Books"],
      summary: "Add a copy",
      request: {
        params: BookParams,
        body: { content: { "application/json": { schema: CopyFields } } },
      },
      responses: { 201: json(Book, "The book with its copies"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      await addCopy(c.var.db, c.var.user.id, id, c.req.valid("json"));
      return c.json(await getBook(c.var.db, id), 201);
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}/copies/{copyId}",
      tags: ["Books"],
      summary: "Change a copy's location, format or note",
      request: {
        params: CopyParams,
        body: { content: { "application/json": { schema: CopyFields } } },
      },
      responses: { 200: json(Book, "The book with its copies"), ...errors },
    }),
    async (c) => {
      const { id, copyId } = c.req.valid("param");
      await updateCopy(c.var.db, id, copyId, c.req.valid("json"));
      return c.json(await getBook(c.var.db, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}/copies/{copyId}",
      tags: ["Books"],
      summary: "Remove a copy",
      description:
        "Refused with 409 `copy_lent` while the copy is lent out. Removing the last copy deletes the book unless reading or loan records refer to it; `bookKept` tells which happened.",
      request: { params: CopyParams },
      responses: {
        200: json(z.object({ bookKept: z.boolean() }), "The copy is gone"),
        ...errors,
      },
    }),
    async (c) => {
      const { id, copyId } = c.req.valid("param");
      return c.json(await removeCopy(c.var.db, id, copyId), 200);
    },
  );
