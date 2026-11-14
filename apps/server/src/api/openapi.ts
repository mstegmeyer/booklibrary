import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }),
  })
  .openapi("Error");

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

export const errors = {
  400: json(ErrorSchema, "Invalid request"),
  401: json(ErrorSchema, "Not signed in"),
  403: json(ErrorSchema, "Not allowed"),
  404: json(ErrorSchema, "Not found"),
  409: json(ErrorSchema, "Conflict"),
} as const;
