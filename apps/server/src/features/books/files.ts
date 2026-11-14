import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { book, bookFile, type fileFormats } from "../../db/schema.ts";
import { readCover, saveCover } from "./covers.ts";
import {
  EpubError,
  type EpubMetadata,
  isEpub,
  readEpub,
  writeEpub,
} from "./epub.ts";
import { deleteBookIfUnreferenced } from "./service.ts";

export type FileFormat = (typeof fileFormats)[number];

export const maxFileBytes = 300 * 1024 * 1024;

export const mediaTypes: Record<FileFormat, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
};

/** A file as it was uploaded, before it goes into the library folder. */
export type Upload = {
  format: FileFormat;
  bytes: Uint8Array;
  sha256: string;
  /** What the file says about the book; EPUB only. */
  epub: EpubMetadata | null;
};

const fileNotFound = () => new ApiError(404, "not_found", "File not found");

// Uploads wait for the user's confirmation in DATA_DIR, next to the database.
const uploadsDir = (db: Db) => join(dirname(db.$client.name), "uploads");
const uploadId = /^[0-9a-f-]{36}\.(epub|pdf)$/;
const uploadMaxAge = 24 * 60 * 60 * 1000;

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function formatOf(bytes: Uint8Array): FileFormat | null {
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-") {
    return "pdf";
  }
  return isEpub(bytes) ? "epub" : null;
}

/**
 * Reads an uploaded file. Refuses anything but EPUB and PDF, and files that
 * are already in the library (409 `duplicate_file` with that book's id).
 */
export function inspect(db: Db, bytes: Uint8Array): Upload {
  const format = formatOf(bytes);
  if (!format) {
    throw new ApiError(
      400,
      "unsupported_file",
      "Only EPUB and PDF files can be added",
    );
  }
  const hash = sha256(bytes);
  const existing = db
    .select({ bookId: bookFile.bookId })
    .from(bookFile)
    .where(or(eq(bookFile.sha256, hash), eq(bookFile.uploadSha256, hash)))
    .get();
  if (existing) {
    throw new ApiError(
      409,
      "duplicate_file",
      "This file is already in the library",
      {
        bookId: existing.bookId,
      },
    );
  }
  return {
    format,
    bytes,
    sha256: hash,
    epub: format === "epub" ? readEpub(bytes) : null,
  };
}

/** Keeps an upload until it is confirmed; returns its id. */
export async function stageUpload(db: Db, upload: Upload) {
  const dir = uploadsDir(db);
  await mkdir(dir, { recursive: true });
  // Uploads nobody confirmed are cleared out from time to time.
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if (Date.now() - (await stat(path)).mtimeMs > uploadMaxAge) {
      await rm(path, { force: true });
    }
  }
  const id = `${randomUUID()}.${upload.format}`;
  await writeFile(join(dir, id), upload.bytes);
  return id;
}

async function readStaged(db: Db, id: string) {
  if (!uploadId.test(id))
    throw new ApiError(400, "bad_request", "Invalid upload id");
  try {
    return new Uint8Array(await readFile(join(uploadsDir(db), id)));
  } catch {
    throw new ApiError(
      404,
      "not_found",
      "The upload has expired; please upload the file again",
    );
  }
}

export const readUpload = async (db: Db, id: string) =>
  inspect(db, await readStaged(db, id));

export const discardUpload = (db: Db, id: string) =>
  rm(join(uploadsDir(db), id), { force: true });

export async function uploadCover(db: Db, id: string) {
  const bytes = await readStaged(db, id);
  const cover = formatOf(bytes) === "epub" ? readEpub(bytes).cover : null;
  if (!cover) throw new ApiError(404, "not_found", "The file has no cover");
  return cover;
}

/** Refuses a second file of the same format unless it is to replace the first. */
export function assertFormatFree(
  db: Db,
  bookId: string,
  format: FileFormat,
  replace = false,
) {
  if (replace) return;
  const taken = db
    .select({ id: bookFile.id })
    .from(bookFile)
    .where(and(eq(bookFile.bookId, bookId), eq(bookFile.format, format)))
    .get();
  if (taken) {
    throw new ApiError(
      409,
      "format_exists",
      `The book already has a ${format.toUpperCase()} file`,
      {
        bookId,
      },
    );
  }
}

// Characters Windows, macOS or Linux do not allow in names, and controls.
// biome-ignore lint/suspicious/noControlCharactersInRegex: they are what is removed
const forbidden = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const reserved = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const maxNameLength = 100;
export const unknownAuthorFolder = "Unknown author";

/** A file or folder name that every common file system accepts. */
export function safeName(text: string) {
  let name = text
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(forbidden, "_")
    .trim();
  name = [...name].slice(0, maxNameLength).join("");
  // No hidden files, and Windows drops trailing dots and spaces.
  name = name.replace(/^[.\s]+|[.\s]+$/g, "");
  if (reserved.test(name)) name = `${name}_`;
  return name || "_";
}

/**
 * `<Sort as>/<title>.<ext>`, with " (2)", " (3)" … when another file has the
 * name already, compared without case for case-insensitive file systems.
 */
function freePath(
  db: Db,
  libraryDir: string,
  target: { title: string; sortKey: string },
  format: FileFormat,
  file?: { id: string; path: string },
) {
  const folder = target.sortKey
    ? safeName(target.sortKey)
    : unknownAuthorFolder;
  const base = safeName(target.title);
  for (let n = 1; ; n++) {
    const path = `${folder}/${base}${n > 1 ? ` (${n})` : ""}.${format}`;
    if (file && path.toLowerCase() === file.path.toLowerCase()) return path;
    const takenByRow = db
      .select({ id: bookFile.id })
      .from(bookFile)
      .where(
        and(
          sql`${bookFile.path} = ${path} collate nocase`,
          file ? ne(bookFile.id, file.id) : undefined,
        ),
      )
      .get();
    if (!takenByRow && !existsSync(join(libraryDir, path))) return path;
  }
}

/** Writes through a temporary file, so a reader never sees half a book. */
async function writeAtomically(path: string, bytes: Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

/** Keeps the folder tidy: an author folder goes with its last file. */
async function removeEmptyFolder(libraryDir: string, path: string) {
  const folder = dirname(join(libraryDir, path));
  if (folder === libraryDir) return;
  await rmdir(folder).catch(() => {});
}

function findBook(db: Db, bookId: string) {
  const found = db
    .select({
      title: book.title,
      authors: book.authors,
      sortKey: book.sortKey,
      coverPath: book.coverPath,
    })
    .from(book)
    .where(eq(book.id, bookId))
    .get();
  if (!found) throw new ApiError(404, "not_found", "Book not found");
  return found;
}

/** The EPUB with the book's title, authors and, if asked, cover written in. */
async function withMetadata(
  db: Db,
  bookId: string,
  bytes: Uint8Array,
  target: { title: string; authors: string[]; coverPath: string | null },
  withCover: boolean,
) {
  try {
    return writeEpub(bytes, {
      title: target.title,
      authors: target.authors,
      cover:
        withCover && target.coverPath
          ? new Uint8Array(await readCover(db, bookId, "full"))
          : undefined,
    });
  } catch (error) {
    if (!(error instanceof EpubError)) throw error;
    console.warn(
      `Metadata not written into the EPUB of book ${bookId}: ${error.message}`,
    );
    return bytes;
  }
}

/**
 * Puts an uploaded file into the library folder as the book's file of its
 * format, replacing one of that format when `replace` is set. A book without
 * a cover takes the EPUB's; otherwise the book's cover is written into it.
 */
export async function attachFile(
  db: Db,
  libraryDir: string,
  userId: string,
  bookId: string,
  upload: Upload,
  replace = false,
) {
  assertFormatFree(db, bookId, upload.format, replace);
  let coverFromFile = false;
  if (!findBook(db, bookId).coverPath && upload.epub?.cover) {
    try {
      await saveCover(db, bookId, upload.epub.cover);
      coverFromFile = true;
    } catch (error) {
      console.warn(`Cover of the EPUB for book ${bookId} not stored: ${error}`);
    }
  }

  const target = findBook(db, bookId);
  const isProtected = upload.epub?.isProtected ?? false;
  const bytes =
    upload.format === "epub" && !isProtected
      ? await withMetadata(db, bookId, upload.bytes, target, !coverFromFile)
      : upload.bytes;

  const existing = db
    .select()
    .from(bookFile)
    .where(and(eq(bookFile.bookId, bookId), eq(bookFile.format, upload.format)))
    .get();
  const path = freePath(db, libraryDir, target, upload.format, existing);
  if (existing && existing.path !== path) {
    await rm(join(libraryDir, existing.path), { force: true });
    await removeEmptyFolder(libraryDir, existing.path);
  }
  await writeAtomically(join(libraryDir, path), bytes);

  const fields = {
    path,
    size: bytes.length,
    sha256: sha256(bytes),
    uploadSha256: upload.sha256,
    isProtected,
    createdAt: Date.now(),
    createdBy: userId,
  };
  if (existing) {
    db.update(bookFile).set(fields).where(eq(bookFile.id, existing.id)).run();
  } else {
    db.insert(bookFile)
      .values({ ...fields, bookId, format: upload.format })
      .run();
  }
}

/**
 * Brings the book's files in line with the catalogue: moves them when the
 * title or "Sort as" changed, and writes title, authors and (with `cover`)
 * the cover into EPUBs that are not copy-protected. Missing files are left
 * alone.
 */
export async function syncFiles(
  db: Db,
  libraryDir: string,
  bookId: string,
  write: { metadata?: boolean; cover?: boolean } = {},
) {
  const target = findBook(db, bookId);
  const files = db
    .select()
    .from(bookFile)
    .where(eq(bookFile.bookId, bookId))
    .all();
  for (const file of files) {
    if (!existsSync(join(libraryDir, file.path))) continue;
    const path = freePath(db, libraryDir, target, file.format, file);
    if (path !== file.path) {
      await mkdir(dirname(join(libraryDir, path)), { recursive: true });
      await rename(join(libraryDir, file.path), join(libraryDir, path));
      db.update(bookFile).set({ path }).where(eq(bookFile.id, file.id)).run();
      await removeEmptyFolder(libraryDir, file.path);
    }
    if (file.format !== "epub" || file.isProtected) continue;
    if (!write.metadata && !(write.cover && target.coverPath)) continue;
    const full = join(libraryDir, path);
    const bytes = await withMetadata(
      db,
      bookId,
      new Uint8Array(await readFile(full)),
      target,
      write.cover ?? false,
    );
    await writeAtomically(full, bytes);
    db.update(bookFile)
      .set({ size: bytes.length, sha256: sha256(bytes) })
      .where(eq(bookFile.id, file.id))
      .run();
  }
}

export function findFile(db: Db, bookId: string, fileId: string) {
  const file = db
    .select()
    .from(bookFile)
    .where(and(eq(bookFile.id, fileId), eq(bookFile.bookId, bookId)))
    .get();
  if (!file) throw fileNotFound();
  return file;
}

/**
 * Deletes the file from disk (if it is still there) and from the catalogue.
 * The book goes too when nothing else refers to it.
 */
export async function removeFile(
  db: Db,
  libraryDir: string,
  bookId: string,
  fileId: string,
) {
  const file = findFile(db, bookId, fileId);
  await rm(join(libraryDir, file.path), { force: true });
  await removeEmptyFolder(libraryDir, file.path);
  db.delete(bookFile).where(eq(bookFile.id, file.id)).run();
  const { kept } = await deleteBookIfUnreferenced(db, bookId);
  return { bookKept: kept };
}

/** A download name like "The Name of the Rose.epub". */
export const downloadName = (path: string) =>
  path.slice(path.lastIndexOf("/") + 1);
