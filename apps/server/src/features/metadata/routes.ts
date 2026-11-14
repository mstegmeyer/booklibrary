import { createRoute, z } from "@hono/zod-openapi";
import { ApiError } from "../../api/errors.ts";
import { ErrorSchema, errors, json } from "../../api/openapi.ts";
import { createRouter } from "../../api/router.ts";
import { normalizeIsbn } from "../books/isbn.ts";
import { withGuesses } from "./guesses.ts";
import { lookupIsbn, searchBooks } from "./service.ts";
import { sourceNames } from "./source.ts";

export const Candidate = z
  .object({
    isbn13: z.string().nullable(),
    title: z.string(),
    subtitle: z.string().nullable(),
    authors: z.array(z.string()),
    description: z.string().nullable(),
    pageCount: z.number().int().nullable(),
    publishedYear: z.number().int().nullable(),
    language: z.string().nullable().openapi({ description: "BCP 47" }),
    coverUrl: z.string().nullable(),
    sources: z.array(z.enum(sourceNames)),
    bookId: z.string().nullable().openapi({
      description: "The book that already has this ISBN",
    }),
    genreId: z.string().nullable().openapi({
      description:
        "The built-in genre the sources' categories point to; null when they leave it unclear or `bookId` is set",
    }),
  })
  .openapi("MetadataCandidate");

const unavailable = {
  502: json(ErrorSchema, "No metadata source could be reached"),
};

const unavailableError = () =>
  new ApiError(
    502,
    "metadata_unavailable",
    "No metadata source could be reached",
  );

export const metadataRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/isbn/{isbn}",
      tags: ["Metadata"],
      summary: "Look up a book by ISBN",
      request: { params: z.object({ isbn: z.string() }) },
      responses: {
        200: json(Candidate, "The combined metadata of all sources"),
        ...errors,
        400: json(ErrorSchema, "Invalid ISBN"),
        404: json(ErrorSchema, "No source knows this ISBN"),
        ...unavailable,
      },
    }),
    async (c) => {
      const isbn13 = normalizeIsbn(c.req.valid("param").isbn);
      if (!isbn13) throw new ApiError(400, "invalid_isbn", "Not a valid ISBN");
      const result = await lookupIsbn(isbn13);
      if (result === "unavailable") throw unavailableError();
      if (result === "not_found") {
        throw new ApiError(
          404,
          "metadata_not_found",
          "No source knows this ISBN",
        );
      }
      return c.json(withGuesses(c.var.db, result), 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/search",
      tags: ["Metadata"],
      summary: "Search books by title or author",
      request: {
        query: z.object({ q: z.string().trim().min(1).max(200) }),
      },
      responses: {
        200: json(z.object({ items: z.array(Candidate) }), "Candidates"),
        ...errors,
        ...unavailable,
      },
    }),
    async (c) => {
      const result = await searchBooks(c.req.valid("query").q);
      if (result === "unavailable") throw unavailableError();
      return c.json(
        { items: result.map((found) => withGuesses(c.var.db, found)) },
        200,
      );
    },
  );
