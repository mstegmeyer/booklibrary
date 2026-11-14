import { createRoute, z } from "@hono/zod-openapi";
import { errors, json } from "../../api/openapi.ts";
import { createRouter } from "../../api/router.ts";
import { GenreRef } from "../genres/routes.ts";
import { listMembers, statistics } from "./service.ts";

const Months = z.array(z.number().int()).length(12).openapi({
  description: "January to December",
});

const Statistics = z
  .object({
    year: z.number().int(),
    booksFinished: z.number().int(),
    pagesRead: z.number().int(),
    pagesPerDay: z.number().int().openapi({
      description: "Over the days of the year that have passed",
    }),
    notInLibrary: z.number().int().openapi({
      description:
        "Books finished this year that the household owns neither a copy nor an e-book file of",
    }),
    booksPerMonth: Months,
    pagesPerMonth: Months,
    byGenre: z
      .array(z.object({ genre: GenreRef.nullable(), books: z.number().int() }))
      .openapi({
        description:
          "Books finished this year by genre, most first; those without a genre last",
      }),
    booksPerYear: z.array(
      z.object({ year: z.number().int(), books: z.number().int() }),
    ),
    undated: z.number().int().openapi({
      description: "Finished reads without a date; in no year",
    }),
    allTime: z.number().int().openapi({ description: "All finished reads" }),
    years: z.array(z.number().int()).openapi({
      description: "Years with finished reads or progress",
    }),
  })
  .openapi("Statistics");

export const statisticsRoutes = createRouter()
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Statistics"],
      summary: "Reading statistics for a year",
      description:
        "Of one user, or of the whole household when `userId` is missing. In the household a book read by two people counts twice.",
      request: {
        query: z.object({
          userId: z.string().optional(),
          year: z.coerce.number().int().min(0).max(9999),
        }),
      },
      responses: { 200: json(Statistics, "The statistics"), ...errors },
    }),
    (c) => {
      const { userId, year } = c.req.valid("query");
      return c.json(statistics(c.var.db, userId, year), 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/members",
      tags: ["Statistics"],
      summary: "Household members",
      description: "Everyone whose reading can be shown, sorted by name.",
      responses: {
        200: json(
          z.array(z.object({ id: z.string(), name: z.string() })),
          "The members",
        ),
        ...errors,
      },
    }),
    (c) => c.json(listMembers(c.var.db), 200),
  );
