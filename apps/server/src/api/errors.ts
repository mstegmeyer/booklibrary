import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal";

export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errorBody = (code: string, message: string) => ({
  error: { code, message },
});
