import { createReadStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createRoute, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { ApiError } from "../../api/errors.ts";
import { errors, json } from "../../api/openapi.ts";
import { PaginationQuery, page } from "../../api/pagination.ts";
import { createRouter } from "../../api/router.ts";
import { bookFormats, fileFormats, readingStatuses } from "../../db/schema.ts";
import { ContactInput } from "../contacts/routes.ts";
import { GenreRef } from "../genres/routes.ts";
import { withGuesses } from "../metadata/guesses.ts";
import { Candidate } from "../metadata/routes.ts";
import { lookupIsbn, merge } from "../metadata/service.ts";
import {
  type Candidate as CandidateValue,
  sourceNames,
} from "../metadata/source.ts";
import { addBook } from "./add.ts";
import { lookUpCover, readCover, saveCover } from "./covers.ts";
import {
  attachFile,
  downloadName,
  findFile,
  inspect,
  maxFileBytes,
  mediaTypes,
  removeFile,
  stageUpload,
  syncFiles,
  type Upload,
  uploadCover,
} from "./files.ts";
import { normalizeIsbn } from "./isbn.ts";
import { refreshFromCatalogue } from "./refresh.ts";
import {
  addCopy,
  getBook,
  librarySummary,
  listLibrary,
  removeCopy,
  updateBook,
  updateCopy,
} from "./service.ts";

const maxCoverBytes = 10 * 1024 * 1024;

const limitFileSize = bodyLimit({
  maxSize: maxFileBytes,
  onError: () => {
    throw new ApiError(
      413,
      "file_too_large",
      `Files can be up to ${maxFileBytes / 1024 / 1024} MB`,
    );
  },
});

const FileUpload = z.object({
  file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
});

const Isbn = z
  .string()
  .transform((value, ctx) => {
    const isbn = normalizeIsbn(value);
    if (isbn) return isbn;
    ctx.addIssue({ code: "custom", message: `Invalid ISBN: ${value}` });
    return z.NEVER;
  })
  .openapi({
    description: "ISBN-10 or ISBN-13, hyphens allowed; stored as ISBN-13",
  });

const Text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const BookFields = z.object({
  title: z.string().trim().min(1).max(500),
  subtitle: Text(500),
  authors: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  description: Text(10_000),
  pageCount: z.number().int().min(1).max(100_000).nullable().optional(),
  publishedYear: z.number().int().min(0).max(9999).nullable().optional(),
  language: Text(50),
  genreId: z.string().nullable().optional(),
  isbns: z.array(Isbn).max(20).optional(),
});

const CopyFields = z.object({
  locationId: z.string().nullable().optional(),
  format: z.enum(bookFormats).nullable().optional(),
  note: Text(500),
});

const ReadingSummary = z.object({
  status: z.enum(readingStatuses),
  progress: z.number().int().nullable(),
});

const LibraryItem = z
  .object({
    id: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    pageCount: z.number().int().nullable(),
    coverUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    copyCount: z.number().int(),
    ebook: z.boolean().openapi({ description: "The book has an e-book file" }),
    genre: GenreRef.nullable(),
    availability: z.enum(["shelf", "lent"]).openapi({
      description:
        "`lent` when the household has copies and every one is lent out",
    }),
    locationPath: z.array(z.string()).openapi({
      description: "Where the first available copy is; empty if not placed",
    }),
    lentTo: z.string().nullable().openapi({
      description: "Who has the first copy when every copy is lent out",
    }),
    reading: ReadingSummary.nullable().openapi({
      description: "The signed-in user's current reading of the book",
    }),
  })
  .openapi("LibraryItem");

const Copy = z
  .object({
    id: z.string(),
    format: z.enum(bookFormats).nullable(),
    note: z.string().nullable(),
    location: z
      .object({ id: z.string(), path: z.array(z.string()) })
      .nullable(),
    loan: z
      .object({ contactName: z.string(), startedOn: z.string() })
      .nullable(),
  })
  .openapi("Copy");

const BookFile = z
  .object({
    id: z.string(),
    format: z.enum(fileFormats),
    size: z.number().int(),
    path: z.string().openapi({
      description: "Where the file is in the library folder",
    }),
    isProtected: z.boolean().openapi({
      description: "Copy-protected (DRM): nothing is written into the file",
    }),
    missing: z.boolean().openapi({
      description: "The file is no longer in the library folder",
    }),
  })
  .openapi("BookFile");

const Book = z
  .object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    authors: z.array(z.string()),
    sortAs: z.string().openapi({
      description: "How the book sorts by author, e.g. `Eco, Umberto`",
    }),
    description: z.string().nullable(),
    pageCount: z.number().int().nullable(),
    publishedYear: z.number().int().nullable(),
    language: z.string().nullable(),
    genre: GenreRef.nullable(),
    isbns: z.array(z.string()),
    coverUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    metadataSource: z.string().nullable(),
    createdAt: z.number().int(),
    createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
    copies: z.array(Copy),
    files: z.array(BookFile),
  })
  .openapi("Book");

const LibraryQuery = PaginationQuery.extend({
  q: z.string().optional(),
  locationId: z.string().optional().openapi({
    description: "Only books with a copy here or in a location inside",
  }),
  availability: z.enum(["shelf", "lent"]).optional(),
  format: z.enum(["print", "ebook"]).optional().openapi({
    description: "`print`: with a copy; `ebook`: with an e-book file",
  }),
  reading: z
    .enum([...readingStatuses, "none"])
    .optional()
    .openapi({
      description: "The signed-in user's current reading status",
    }),
  genre: z.string().optional().openapi({
    description: "A genre's id, or `none` for books without a genre",
  }),
  sort: z.enum(["added", "title", "author"]).default("added"),
});

const BookParams = z.object({ id: z.string() });
const FileParams = z.object({ id: z.string(), fileId: z.string() });

/** The file's own metadata, completed by a catalogue lookup of its ISBN. */
async function candidateOf(upload: Upload): Promise<CandidateValue | null> {
  const epub = upload.epub;
  const fromFile: CandidateValue | null = epub?.title
    ? {
        isbn13: epub.isbns[0] ?? null,
        title: epub.title,
        subtitle: null,
        authors: epub.authors,
        description: epub.description,
        pageCount: null,
        publishedYear: epub.publishedYear,
        language: epub.language,
        coverUrl: null,
        sources: ["epub"],
        categories: [],
        bindings: [],
      }
    : null;
  const isbn = epub?.isbns[0];
  const found = isbn ? await lookupIsbn(isbn) : null;
  if (found === null || typeof found === "string") return fromFile;
  return fromFile ? merge(fromFile, found) : found;
}
const CopyParams = z.object({ id: z.string(), copyId: z.string() });

const router = createRouter();

router.use("/uploads", limitFileSize);
router.use("/:id/files", limitFileSize);

// Images and e-books are not JSON, so these routes stay outside the typed client.
router.get("/uploads/:upload/cover", async (c) => {
  const cover = await uploadCover(c.var.db, c.req.param("upload"));
  return c.body(new Uint8Array(cover), 200, {
    "cache-control": "private, max-age=86400",
  });
});

router.get("/:id/files/:fileId", async (c) => {
  const file = findFile(c.var.db, c.req.param("id"), c.req.param("fileId"));
  const stream = createReadStream(join(c.var.libraryDir, file.path));
  await new Promise<void>((resolve, reject) => {
    stream.once("open", () => resolve());
    stream.once("error", () =>
      reject(new ApiError(404, "not_found", "The file is missing")),
    );
  });
  const name = downloadName(file.path);
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
    "content-type": mediaTypes[file.format],
    "content-length": String(file.size),
    "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
});

router.get("/:id/cover", async (c) => {
  const size = c.req.query("size") === "thumb" ? "thumb" : "full";
  const image = await readCover(c.var.db, c.req.param("id"), size);
  return c.body(new Uint8Array(image), 200, {
    "content-type": "image/jpeg",
    // Every new cover gets a new URL, so a cached one never goes stale.
    "cache-control": "private, max-age=31536000, immutable",
  });
});

export const booksRoutes = router
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Books"],
      summary: "List the library",
      description:
        "Books the household owns (at least one copy), filtered and sorted.",
      request: { query: LibraryQuery },
      responses: {
        200: json(
          page(LibraryItem).extend({ total: z.number().int() }),
          "A page of books and the number of all matches",
        ),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listLibrary(c.var.db, c.var.user.id, c.req.valid("query")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/summary",
      tags: ["Books"],
      summary: "Library figures",
      responses: {
        200: json(
          z.object({
            books: z.number().int(),
            places: z.number().int(),
            lentOut: z.number().int(),
          }),
          "Owned books, top-level locations and copies lent out",
        ),
        ...errors,
      },
    }),
    async (c) => c.json(await librarySummary(c.var.db), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      tags: ["Books"],
      summary: "Add a book",
      description: `Creates a book with at most one kind of ownership: \`copy\` (in the library), \`borrowedFrom\` (a borrowed loan from \`borrowedOn\`, the client's today, no copy), \`wantToRead\` (the signed-in user's reading list, no copy) or \`upload\` (an e-book file uploaded through \`POST /books/uploads\`). \`coverUrl\` and \`sources\` come from a metadata lookup; a cover that cannot be downloaded is skipped.

When an ISBN already belongs to a book, the ownership is applied to that book (\`outcome: "known"\`). It is refused with 409 \`isbn_taken\` and the book's id as \`error.bookId\` when no ownership is given, or when a copy is to be added to a book the household already owns; add another copy through \`POST /books/{id}/copies\` instead.

When the ISBNs are new but the title and first author match an existing book, it is refused with 409 \`same_book\` and that book's id as \`error.bookId\`. Send the request again with \`attachTo\` set to that id to add the ISBNs and the ownership to it (\`outcome: "attached"\`), or with \`keepSeparate: true\` to create a new book.

A file of a format the book already has is refused with 409 \`format_exists\`; send \`replace: true\` to replace it. Without ISBNs, an upload also asks \`same_book\` for a matching title and first author. A book without a cover takes the lookup's \`coverUrl\`, or else the EPUB's cover.

\`statusKept\` is true when \`wantToRead\` left an existing reading status unchanged.`,
      request: {
        body: {
          content: {
            "application/json": {
              schema: BookFields.extend({
                copy: CopyFields.optional(),
                borrowedFrom: ContactInput.optional(),
                borrowedOn: z.iso.date().optional(),
                wantToRead: z.boolean().optional(),
                upload: z.string().optional(),
                replace: z.boolean().optional(),
                coverUrl: z.url().max(2000).optional(),
                sources: z.array(z.enum(sourceNames)).optional(),
                attachTo: z.string().optional(),
                keepSeparate: z.boolean().optional(),
              }).refine(
                (input) =>
                  [
                    input.copy,
                    input.borrowedFrom,
                    input.wantToRead,
                    input.upload,
                  ].filter(Boolean).length <= 1,
                "Give at most one of copy, borrowedFrom, wantToRead and upload",
              ),
            },
          },
        },
      },
      responses: {
        201: json(
          Book.extend({
            outcome: z.enum(["created", "known", "attached"]),
            statusKept: z.boolean(),
          }),
          "The book that was added to",
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { bookId, ...added } = await addBook(
        c.var.db,
        c.var.libraryDir,
        c.var.user.id,
        c.req.valid("json"),
      );
      return c.json(
        { ...(await getBook(c.var.db, c.var.libraryDir, bookId)), ...added },
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["Books"],
      summary: "Get a book with its copies",
      request: { params: BookParams },
      responses: { 200: json(Book, "The book"), ...errors },
    }),
    async (c) =>
      c.json(
        await getBook(c.var.db, c.var.libraryDir, c.req.valid("param").id),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Books"],
      summary: "Edit a book's metadata and ISBNs",
      description:
        "`isbns`, when given, replaces the whole list. An ISBN of another book gives 409 `isbn_taken` with `error.bookId`. An empty or missing `sortAs` sorts the book by a guess from its first author's name. The book's e-book files move when the title or `sortAs` changes, and a new title or new authors are written into its EPUB.",
      request: {
        params: BookParams,
        body: {
          content: {
            "application/json": {
              schema: BookFields.partial().extend({
                sortAs: z.string().trim().max(200).optional(),
              }),
            },
          },
        },
      },
      responses: { 200: json(Book, "The changed book"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { titleOrAuthorsChanged } = updateBook(
        c.var.db,
        id,
        c.req.valid("json"),
      );
      await syncFiles(c.var.db, c.var.libraryDir, id, {
        metadata: titleOrAuthorsChanged,
      });
      return c.json(await getBook(c.var.db, c.var.libraryDir, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/{id}/cover",
      tags: ["Books"],
      summary: "Upload a cover image",
      description: `Replaces the cover, also in the book's EPUB. Any common image format up to ${maxCoverBytes / 1024 / 1024} MB.`,
      request: {
        params: BookParams,
        body: {
          content: {
            "multipart/form-data": {
              schema: z.object({
                file: z
                  .instanceof(File)
                  .openapi({ type: "string", format: "binary" }),
              }),
            },
          },
        },
      },
      responses: { 200: json(Book, "The book with its new cover"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { file } = c.req.valid("form");
      if (file.size > maxCoverBytes) {
        throw new ApiError(400, "bad_request", "The image is too large");
      }
      await saveCover(c.var.db, id, new Uint8Array(await file.arrayBuffer()));
      await syncFiles(c.var.db, c.var.libraryDir, id, { cover: true });
      return c.json(await getBook(c.var.db, c.var.libraryDir, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/{id}/cover/lookup",
      tags: ["Books"],
      summary: "Look up a cover in the catalogues",
      description:
        "Looks up the book's ISBNs in turn, like `GET /metadata/isbn/{isbn}`, and stores the first cover found as the book's cover, also in its EPUB. 404 `cover_not_found` when no catalogue has one, also for a book without ISBNs; 502 `metadata_unavailable` when the catalogues could not be reached.",
      request: { params: BookParams },
      responses: { 200: json(Book, "The book with its new cover"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      await lookUpCover(c.var.db, id);
      await syncFiles(c.var.db, c.var.libraryDir, id, { cover: true });
      return c.json(await getBook(c.var.db, c.var.libraryDir, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/{id}/lookup",
      tags: ["Books"],
      summary: "Update a book from the catalogues",
      description:
        "Looks up the book's ISBNs like `GET /metadata/isbn/{isbn}` and replaces title, subtitle, authors, description, page count, year, language, cover and genre with what the catalogues say. A field they have nothing for keeps its value, and the genre stays without a guess. With exactly one ISBN, every copy takes the binding the catalogues state. `sortAs` is guessed anew only when the authors change. The e-book files follow as for an edit. 404 `metadata_not_found` when no catalogue knows the book (or it has no ISBN), 502 `metadata_unavailable` when they could not be reached; nothing changes then.",
      request: { params: BookParams },
      responses: { 200: json(Book, "The updated book"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { titleOrAuthorsChanged, coverStored } = await refreshFromCatalogue(
        c.var.db,
        id,
      );
      await syncFiles(c.var.db, c.var.libraryDir, id, {
        metadata: titleOrAuthorsChanged,
        cover: coverStored,
      });
      return c.json(await getBook(c.var.db, c.var.libraryDir, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/{id}/copies",
      tags: ["Books"],
      summary: "Add a copy",
      request: {
        params: BookParams,
        body: { content: { "application/json": { schema: CopyFields } } },
      },
      responses: { 201: json(Book, "The book with its copies"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      await addCopy(c.var.db, c.var.user.id, id, c.req.valid("json"));
      return c.json(await getBook(c.var.db, c.var.libraryDir, id), 201);
    },
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/{id}/copies/{copyId}",
      tags: ["Books"],
      summary: "Change a copy's location, format or note",
      request: {
        params: CopyParams,
        body: { content: { "application/json": { schema: CopyFields } } },
      },
      responses: { 200: json(Book, "The book with its copies"), ...errors },
    }),
    async (c) => {
      const { id, copyId } = c.req.valid("param");
      await updateCopy(c.var.db, id, copyId, c.req.valid("json"));
      return c.json(await getBook(c.var.db, c.var.libraryDir, id), 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}/copies/{copyId}",
      tags: ["Books"],
      summary: "Remove a copy",
      description:
        "Refused with 409 `copy_lent` while the copy is lent out. Removing the last copy deletes the book unless reading or loan records refer to it; `bookKept` tells which happened.",
      request: { params: CopyParams },
      responses: {
        200: json(z.object({ bookKept: z.boolean() }), "The copy is gone"),
        ...errors,
      },
    }),
    async (c) => {
      const { id, copyId } = c.req.valid("param");
      return c.json(await removeCopy(c.var.db, id, copyId), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/uploads",
      tags: ["Books"],
      summary: "Upload an e-book to add",
      description: `The first step of adding a book from an EPUB or PDF file of up to ${maxFileBytes / 1024 / 1024} MB. Nothing is saved yet: the file waits for \`POST /books\` with \`upload\` set to the returned \`id\`.

For an EPUB, \`candidate\` is the metadata inside the file completed by a catalogue lookup of its ISBN (null when the file has no title), and \`fileCoverUrl\` its cover. \`candidate.coverUrl\` is only the lookup's. Nothing is read from a PDF.

A file that is already in the library is refused with 409 \`duplicate_file\` and that book's id as \`error.bookId\`; other files than EPUB and PDF with 400 \`unsupported_file\`.`,
      request: {
        body: { content: { "multipart/form-data": { schema: FileUpload } } },
      },
      responses: {
        201: json(
          z.object({
            id: z.string(),
            format: z.enum(fileFormats),
            size: z.number().int(),
            isProtected: z.boolean(),
            candidate: Candidate.nullable(),
            fileCoverUrl: z.string().nullable(),
          }),
          "The waiting upload and what was found about the book",
        ),
        ...errors,
      },
    }),
    async (c) => {
      const { file } = c.req.valid("form");
      const upload = inspect(
        c.var.db,
        new Uint8Array(await file.arrayBuffer()),
      );
      const id = await stageUpload(c.var.db, upload);
      return c.json(
        {
          id,
          format: upload.format,
          size: upload.bytes.length,
          isProtected: upload.epub?.isProtected ?? false,
          candidate: await candidateOf(upload).then(
            (found) => found && withGuesses(c.var.db, found),
          ),
          fileCoverUrl: upload.epub?.cover
            ? `/api/v1/books/uploads/${id}/cover`
            : null,
        },
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/{id}/files",
      tags: ["Books"],
      summary: "Add an e-book file to a book",
      description: `Stores an EPUB or PDF of up to ${maxFileBytes / 1024 / 1024} MB as the book's file of that format and writes the book's title, authors and cover into an EPUB. A format the book already has is refused with 409 \`format_exists\` unless \`replace\` is true. A file already in the library is refused with 409 \`duplicate_file\` and that book's id as \`error.bookId\`.`,
      request: {
        params: BookParams,
        query: z.object({ replace: z.stringbool().optional() }),
        body: { content: { "multipart/form-data": { schema: FileUpload } } },
      },
      responses: { 201: json(Book, "The book with its files"), ...errors },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { file } = c.req.valid("form");
      const upload = inspect(
        c.var.db,
        new Uint8Array(await file.arrayBuffer()),
      );
      await attachFile(
        c.var.db,
        c.var.libraryDir,
        c.var.user.id,
        id,
        upload,
        c.req.valid("query").replace,
      );
      return c.json(await getBook(c.var.db, c.var.libraryDir, id), 201);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}/files/{fileId}",
      tags: ["Books"],
      summary: "Remove an e-book file",
      description:
        "Deletes the file from the library folder (if it is still there) and from the catalogue. Removing the book's last copy or file deletes the book unless reading or loan records refer to it; `bookKept` tells which happened. Download a file with `GET /books/{id}/files/{fileId}`.",
      request: { params: FileParams },
      responses: {
        200: json(z.object({ bookKept: z.boolean() }), "The file is gone"),
        ...errors,
      },
    }),
    async (c) => {
      const { id, fileId } = c.req.valid("param");
      return c.json(
        await removeFile(c.var.db, c.var.libraryDir, id, fileId),
        200,
      );
    },
  );
