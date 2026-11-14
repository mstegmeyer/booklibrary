import { createRoute, z } from "@hono/zod-openapi";
import { errors, json } from "../../api/openapi.ts";
import { PaginationQuery, page } from "../../api/pagination.ts";
import { createRouter } from "../../api/router.ts";
import { readingStatuses } from "../../db/schema.ts";
import {
  addProgress,
  clearStatus,
  finish,
  getMyReading,
  householdReading,
  listAbandoned,
  listCurrent,
  listFinished,
  listWanted,
  setStartDate,
  setStatus,
} from "./service.ts";

const IsoDate = z.iso.date().openapi({ description: "`YYYY-MM-DD`" });
const PageCount = z.number().int().min(1).max(100_000).optional().openapi({
  description: "Saved on the book when it has no page count yet",
});

const Status = z.enum(readingStatuses);

const ReadThrough = z.object({
  id: z.string(),
  status: Status,
  startedOn: z.string().nullable(),
  endedOn: z.string().nullable().openapi({
    description: "Finished or abandoned on; null when not known",
  }),
});

const MyReading = z
  .object({
    current: ReadThrough.extend({
      createdAt: z.number().int(),
      page: z.number().int().nullable().openapi({
        description: "The page of the latest progress entry",
      }),
    }).nullable(),
    earlier: z.array(ReadThrough).openapi({
      description: "Earlier (finished) read-throughs, newest first",
    }),
  })
  .openapi("MyReading");

const HouseholdReading = z
  .object({
    user: z.object({ id: z.string(), name: z.string() }),
    status: Status,
    startedOn: z.string().nullable(),
    endedOn: z.string().nullable(),
  })
  .openapi("HouseholdReading");

const ReadingItem = ReadThrough.extend({
  page: z.number().int().nullable(),
  inLibrary: z.boolean().openapi({ description: "The household owns a copy" }),
  borrowed: z.boolean().openapi({
    description: "The household has the book on a borrowed loan now",
  }),
  book: z.object({
    id: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    pageCount: z.number().int().nullable(),
    coverUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
  }),
}).openapi("ReadingItem");

const ReadingPage = page(ReadingItem).extend({ total: z.number().int() });

const BookParams = z.object({ bookId: z.string() });

const jsonBody = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } } },
});

export const readingRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/current",
      tags: ["Reading"],
      summary: "Books the signed-in user is reading",
      responses: {
        200: json(z.object({ items: z.array(ReadingItem) }), "Newest first"),
        ...errors,
      },
    }),
    (c) => c.json({ items: listCurrent(c.var.db, c.var.user.id) }, 200),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/want",
      tags: ["Reading"],
      summary: "Books the signed-in user wants to read",
      description:
        "`within`: the household owns a copy or an e-book file or has borrowed the book. `wishlist`: everything else.",
      request: {
        query: PaginationQuery.extend({
          reach: z.enum(["within", "wishlist"]),
        }),
      },
      responses: { 200: json(ReadingPage, "Newest first"), ...errors },
    }),
    (c) => {
      const { reach, ...query } = c.req.valid("query");
      return c.json(listWanted(c.var.db, c.var.user.id, reach, query), 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/finished",
      tags: ["Reading"],
      summary: "Books the signed-in user finished",
      description:
        "Every finished read-through of a year, or the undated ones.",
      request: {
        query: PaginationQuery.extend({
          year: z.union([
            z.literal("undated"),
            z.coerce.number().int().min(0).max(9999),
          ]),
        }),
      },
      responses: {
        200: json(ReadingPage, "Latest finish date first"),
        ...errors,
      },
    }),
    (c) => {
      const { year, ...query } = c.req.valid("query");
      return c.json(listFinished(c.var.db, c.var.user.id, year, query), 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/abandoned",
      tags: ["Reading"],
      summary: "Books the signed-in user abandoned",
      request: { query: PaginationQuery },
      responses: {
        200: json(ReadingPage, "Most recently abandoned first"),
        ...errors,
      },
    }),
    (c) =>
      c.json(listAbandoned(c.var.db, c.var.user.id, c.req.valid("query")), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/books/{bookId}",
      tags: ["Reading"],
      summary: "The signed-in user's reading of a book",
      request: { params: BookParams },
      responses: { 200: json(MyReading, "Current and earlier"), ...errors },
    }),
    (c) => {
      const { bookId } = c.req.valid("param");
      return c.json(getMyReading(c.var.db, c.var.user.id, bookId), 200);
    },
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/books/{bookId}",
      tags: ["Reading"],
      summary: "Set the reading status",
      description:
        "Starting to read sets the start date to `date` if it is empty; abandoning records `date`. `date` is the reader's today and defaults to the server's. On a finished book, `want` and `reading` start a new read-through and `abandoned` is refused with 409. Use `finish` to mark a book as read.",
      request: {
        params: BookParams,
        ...jsonBody(
          z.object({
            status: z.enum(["want", "reading", "abandoned"]),
            date: IsoDate.optional(),
          }),
        ),
      },
      responses: { 200: json(MyReading, "The new state"), ...errors },
    }),
    (c) => {
      const { bookId } = c.req.valid("param");
      const { id } = c.var.user;
      const { status, date } = c.req.valid("json");
      setStatus(c.var.db, id, bookId, status, date);
      return c.json(getMyReading(c.var.db, id, bookId), 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/books/{bookId}",
      tags: ["Reading"],
      summary: "Clear the reading status",
      description:
        "Removes the current read-through with its progress; an earlier one becomes current again. Deletes the book when nothing else refers to it; `bookKept` tells which happened.",
      request: { params: BookParams },
      responses: {
        200: json(z.object({ bookKept: z.boolean() }), "Cleared"),
        ...errors,
      },
    }),
    async (c) => {
      const { bookId } = c.req.valid("param");
      return c.json(await clearStatus(c.var.db, c.var.user.id, bookId), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/books/{bookId}/progress",
      tags: ["Reading"],
      summary: "Record the page reached",
      description: "Only while the status is `reading`, otherwise 409.",
      request: {
        params: BookParams,
        ...jsonBody(
          z.object({
            date: IsoDate,
            page: z.number().int().min(0).max(100_000),
            pageCount: PageCount,
          }),
        ),
      },
      responses: { 200: json(MyReading, "The new state"), ...errors },
    }),
    (c) => {
      const { bookId } = c.req.valid("param");
      const { id } = c.var.user;
      addProgress(c.var.db, id, bookId, c.req.valid("json"));
      return c.json(getMyReading(c.var.db, id, bookId), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/books/{bookId}/finish",
      tags: ["Reading"],
      summary: "Mark the book as read",
      description:
        "`date` null means the user does not remember. On a book already read this changes the finish date. With a date and a page count the read-through gets a final progress entry on the last page.",
      request: {
        params: BookParams,
        ...jsonBody(
          z.object({ date: IsoDate.nullable(), pageCount: PageCount }),
        ),
      },
      responses: { 200: json(MyReading, "The new state"), ...errors },
    }),
    (c) => {
      const { bookId } = c.req.valid("param");
      const { id } = c.var.user;
      finish(c.var.db, id, bookId, c.req.valid("json"));
      return c.json(getMyReading(c.var.db, id, bookId), 200);
    },
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/books/{bookId}/start-date",
      tags: ["Reading"],
      summary: "Change the start date",
      description:
        "Of the current read-through; `date` null means the user does not remember.",
      request: {
        params: BookParams,
        ...jsonBody(z.object({ date: IsoDate.nullable() })),
      },
      responses: { 200: json(MyReading, "The new state"), ...errors },
    }),
    (c) => {
      const { bookId } = c.req.valid("param");
      const { id } = c.var.user;
      setStartDate(c.var.db, id, bookId, c.req.valid("json").date);
      return c.json(getMyReading(c.var.db, id, bookId), 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/books/{bookId}/household",
      tags: ["Reading"],
      summary: "Other household members' current status for a book",
      request: { params: BookParams },
      responses: {
        200: json(z.array(HouseholdReading), "Sorted by name"),
        ...errors,
      },
    }),
    (c) => {
      const { bookId } = c.req.valid("param");
      return c.json(householdReading(c.var.db, c.var.user.id, bookId), 200);
    },
  );
