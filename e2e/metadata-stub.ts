import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { recordedResponse } from "../apps/server/src/features/metadata/fixtures/recorded.ts";

/** Every source answers 500 for this ISBN, so the catalogues seem down. */
export const unreachableIsbn = "9780000000019";
/** No source knows this ISBN. */
export const unknownIsbn = "9780000000002";

// A 4×6 pixel PNG served for every cover.
const cover = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAIAAABrW6giAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWPI09eCIwZKOQDeZBKpve3O9wAAAABJRU5ErkJggg==",
  "base64",
);
const coverHosts = /https?:\/\/(covers\.openlibrary\.org|books\.google\.com)/g;

/**
 * Serves the recorded Open Library, Google Books and DNB responses on a free
 * local port, with their cover URLs pointing here as well. Pass `env` to the
 * server so its lookups go here instead of to the real services.
 */
export async function startMetadataStub() {
  let url = "";
  const server = createServer((req, res) => {
    const requested = new URL(req.url ?? "/", "http://stub");
    if (req.url?.includes(unreachableIsbn)) {
      res.writeHead(500).end();
    } else if (/^\/(b\/id|books\/content)/.test(requested.pathname)) {
      res.writeHead(200, { "content-type": "image/png" }).end(cover);
    } else {
      const { body, contentType } = recordedResponse(requested);
      res
        .writeHead(200, { "content-type": contentType })
        .end(body.replace(coverHosts, url));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    env: {
      OPEN_LIBRARY_URL: url,
      OPEN_LIBRARY_COVERS_URL: url,
      GOOGLE_BOOKS_URL: url,
      GOOGLE_BOOKS_API_KEY: "stub",
      DNB_SRU_URL: `${url}/sru/dnb`,
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
