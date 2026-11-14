import type { AppType } from "@book-library/server";
import { hc } from "hono/client";

/** Typed client for `/api/v1`, generated from the server's route types. */
export const api = hc<AppType>("/").api.v1;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Returns the JSON body of a successful response and throws ApiError otherwise. */
export async function unwrap<T>(
  request: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<Exclude<T, { error: unknown }>> {
  const res = await request;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code: string; message: string };
    } | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? "internal",
      body?.error?.message ?? res.status.toString(),
    );
  }
  if (res.status === 204) return undefined as Exclude<T, { error: unknown }>;
  return (await res.json()) as Exclude<T, { error: unknown }>;
}
