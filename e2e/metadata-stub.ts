import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { recordedResponse } from "../apps/server/src/features/metadata/fixtures/recorded.ts";

/**
 * Serves the recorded Open Library, Google Books and DNB responses on a free
 * local port. Pass `env` to the server so its lookups go here instead of to
 * the real services.
 */
export async function startMetadataStub() {
  const server = createServer((req, res) => {
    const { body, contentType } = recordedResponse(
      new URL(req.url ?? "/", "http://stub"),
    );
    res.writeHead(200, { "content-type": contentType }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    env: {
      OPEN_LIBRARY_URL: url,
      GOOGLE_BOOKS_URL: url,
      GOOGLE_BOOKS_API_KEY: "stub",
      DNB_SRU_URL: `${url}/sru/dnb`,
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
