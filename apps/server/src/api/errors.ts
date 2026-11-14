import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal"
  | "isbn_taken"
  | "same_book"
  | "copy_lent"
  | "location_not_empty"
  | "location_cycle"
  | "invalid_isbn"
  | "metadata_not_found"
  | "metadata_unavailable";

export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  /** Extra fields for the client, sent next to `code` and `message`. */
  readonly details?: Record<string, unknown>;

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errorBody = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => ({
  error: { ...details, code, message },
});
