import type { AppType } from "@hootshelf/server";
import { hc } from "hono/client";

/** Typed client for `/api/v1`, generated from the server's route types. */
export const api = hc<AppType>("/").api.v1;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Extra fields the server sent with the error, such as an id. */
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// From the body types of every response, not one inferred from them: which
// one inference picks depends on the order of the union.
type Success<Res extends { json(): Promise<unknown> }> = Exclude<
  Awaited<ReturnType<Res["json"]>>,
  { error: unknown }
>;

/** Returns the JSON body of a successful response and throws ApiError otherwise. */
export async function unwrap<
  Res extends { ok: boolean; status: number; json(): Promise<unknown> },
>(request: Promise<Res>): Promise<Success<Res>> {
  const res = await request;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code: string; message: string } & Record<string, unknown>;
    } | null;
    const {
      code = "internal",
      message = res.status.toString(),
      ...details
    } = body?.error ?? {};
    throw new ApiError(res.status, code, message, details);
  }
  if (res.status === 204) return undefined as Success<Res>;
  return (await res.json()) as Success<Res>;
}
