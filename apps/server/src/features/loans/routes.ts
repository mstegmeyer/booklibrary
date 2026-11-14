import { createRoute, z } from "@hono/zod-openapi";
import { errors, json } from "../../api/openapi.ts";
import { PaginationQuery, page } from "../../api/pagination.ts";
import { createRouter } from "../../api/router.ts";
import { bookFormats, loanDirections } from "../../db/schema.ts";
import { ContactInput } from "../contacts/routes.ts";
import {
  borrowBook,
  deleteLoan,
  getLoan,
  type LoanList,
  lendCopy,
  listLoans,
  returnLoan,
  updateLoan,
} from "./service.ts";

const Day = z.iso.date().openapi({ description: "YYYY-MM-DD" });
const Note = z
  .string()
  .trim()
  .max(500)
  .transform((value) => value || null)
  .nullable()
  .optional();

const Loan = z
  .object({
    id: z.string(),
    direction: z.enum(loanDirections),
    startedOn: z.string(),
    endedOn: z.string().nullable(),
    note: z.string().nullable(),
    book: z.object({
      id: z.string(),
      title: z.string(),
      authors: z.array(z.string()),
      coverUrl: z.string().nullable(),
      thumbnailUrl: z.string().nullable(),
    }),
    copy: z
      .object({
        id: z.string(),
        format: z.enum(bookFormats).nullable(),
        locationPath: z.array(z.string()).openapi({
          description: "Where the copy goes back to; empty if not placed",
        }),
      })
      .nullable()
      .openapi({
        description:
          "The copy we lent; null for borrowed books and for history whose copy was removed",
      }),
    contact: z.object({ id: z.string(), name: z.string() }),
  })
  .openapi("Loan");

const LoanPage = page(Loan).extend({ total: z.number().int() });

const NewLoan = z.object({
  contact: ContactInput,
  startedOn: Day,
  note: Note,
});

const LoanParams = z.object({ id: z.string() });

const listRoute = (list: LoanList, summary: string, description: string) =>
  createRoute({
    method: "get",
    path: `/${list}`,
    tags: ["Loans"],
    summary,
    description,
    request: {
      query: PaginationQuery.extend({
        copyId: z.string().optional().openapi({
          description: "Only loans of this copy",
        }),
      }),
    },
    responses: { 200: json(LoanPage, "A page of loans"), ...errors },
  });

export const loansRoutes = createRouter()
  .openapi(
    listRoute(
      "lent",
      "Books lent out",
      "Active loans of our copies, most recent first.",
    ),
    async (c) =>
      c.json(await listLoans(c.var.db, "lent", c.req.valid("query")), 200),
  )
  .openapi(
    listRoute(
      "borrowed",
      "Borrowed books",
      "Active loans of books others lent us, most recent first.",
    ),
    async (c) =>
      c.json(await listLoans(c.var.db, "borrowed", c.req.valid("query")), 200),
  )
  .openapi(
    listRoute(
      "returned",
      "Loan history",
      "Finished loans of both directions, most recently returned first.",
    ),
    async (c) =>
      c.json(await listLoans(c.var.db, "returned", c.req.valid("query")), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/lent",
      tags: ["Loans"],
      summary: "Lend a copy",
      description:
        "Refused with 409 `copy_lent` while the copy is lent out. Pass `contact.name` to add a new person.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: NewLoan.extend({ copyId: z.string() }),
            },
          },
        },
      },
      responses: { 201: json(Loan, "The new loan"), ...errors },
    }),
    async (c) => {
      const { copyId, ...input } = c.req.valid("json");
      const id = lendCopy(c.var.db, copyId, input);
      return c.json(await getLoan(c.var.db, id), 201);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/borrowed",
      tags: ["Loans"],
      summary: "Record a borrowed book",
      description:
        "Someone lent us a book. It has no copy, so it does not appear in the library. Pass `contact.name` to add a new person.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: NewLoan.extend({ bookId: z.string() }),
            },
          },
        },
      },
      responses: { 201: json(Loan, "The new loan"), ...errors },
    }),
    async (c) => {
      const { bookId, ...input } = c.req.valid("json");
      const id = borrowBook(c.var.db, bookId, input);
      return c.json(await getLoan(c.var.db, id), 201);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/{id}/return",
      tags: ["Loans"],
      summary: "Mark a loan returned",
      description: "Refused with 409 `conflict` if it was already returned.",
      request: {
        params: LoanParams,
        body: {
          content: {
            "application/json": { schema: z.object({ endedOn: Day }) },
          },
        },
      },
      responses: { 200: json(Loan, "The finished loan"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      returnLoan(c.var.db, id, c.req.valid("json").endedOn);
      return c.json(await getLoan(c.var.db, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Loans"],
      summary: "Correct a loan",
      description: "Changes the person, dates or note.",
      request: {
        params: LoanParams,
        body: {
          content: {
            "application/json": {
              schema: z.object({
                contact: ContactInput.optional(),
                startedOn: Day.optional(),
                endedOn: Day.optional(),
                note: Note,
              }),
            },
          },
        },
      },
      responses: { 200: json(Loan, "The corrected loan"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      updateLoan(c.var.db, id, c.req.valid("json"));
      return c.json(await getLoan(c.var.db, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["Loans"],
      summary: "Delete a loan",
      description:
        "Removes the record. A book that nothing refers to any more is deleted with it.",
      request: { params: LoanParams },
      responses: { 204: { description: "Deleted" }, ...errors },
    }),
    async (c) => {
      await deleteLoan(c.var.db, c.req.valid("param").id);
      return c.body(null, 204);
    },
  );
