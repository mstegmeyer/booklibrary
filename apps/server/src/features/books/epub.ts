import { posix } from "node:path";
import {
  DOMParser,
  type Document,
  type Element,
  XMLSerializer,
} from "@xmldom/xmldom";
import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from "fflate";
import { languageOf, yearOf } from "../metadata/source.ts";
import { normalizeIsbn } from "./isbn.ts";

// EPUB 3.3 (https://www.w3.org/TR/epub-33/), which also covers EPUB 2 files
// for everything read and written here.

const ns = {
  container: "urn:oasis:names:tc:opendocument:xmlns:container",
  opf: "http://www.idpf.org/2007/opf",
  dc: "http://purl.org/dc/elements/1.1/",
  enc: "http://www.w3.org/2001/04/xmlenc#",
};

// Embedded fonts may be obfuscated (EPUB 3.3, 4.4; Adobe's older scheme does
// the same). That is not copy protection: everything else stays readable.
const fontObfuscation = [
  "http://www.idpf.org/2008/embedding",
  "http://ns.adobe.com/pdf/enc#RC",
];

export class EpubError extends Error {}

export type EpubMetadata = {
  title: string | null;
  authors: string[];
  language: string | null;
  isbns: string[];
  description: string | null;
  publishedYear: number | null;
  cover: Uint8Array | null;
  isProtected: boolean;
};

type Entry = { data: Uint8Array; stored: boolean };

type Epub = {
  entries: Map<string, Entry>;
  opfPath: string;
  opf: Document;
  /** Resources listed in encryption.xml, by their path in the container. */
  encrypted: Set<string>;
  isProtected: boolean;
};

const parseXml = (data: Uint8Array) =>
  new DOMParser().parseFromString(strFromU8(data).replace(/^﻿/, ""), "text/xml");

const elements = (
  parent: Document | Element,
  namespace: string,
  name: string,
) => [...parent.getElementsByTagNameNS(namespace, name)];

const textOf = (element: Element | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() || null;

function open(bytes: Uint8Array): Epub {
  const stored = new Set<string>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.compression === 0) stored.add(file.name);
        return true;
      },
    });
  } catch {
    throw new EpubError("Not a ZIP file");
  }
  const entries = new Map(
    Object.entries(files).map(([name, data]) => [
      name,
      { data, stored: stored.has(name) },
    ]),
  );

  try {
    const container = entries.get("META-INF/container.xml");
    if (!container) throw new EpubError("No META-INF/container.xml");
    const opfPath = elements(parseXml(container.data), ns.container, "rootfile")
      .find(
        (rootfile) =>
          (rootfile.getAttribute("media-type") ??
            "application/oebps-package+xml") ===
          "application/oebps-package+xml",
      )
      ?.getAttribute("full-path");
    const opfEntry = opfPath ? entries.get(opfPath) : undefined;
    if (!opfPath || !opfEntry) throw new EpubError("No package document");
    const opf = parseXml(opfEntry.data);
    if (!elements(opf, ns.opf, "metadata")[0]) {
      throw new EpubError("No metadata in the package document");
    }

    const encrypted = new Set<string>();
    let isProtected = false;
    const encryption = entries.get("META-INF/encryption.xml");
    if (encryption) {
      for (const data of elements(
        parseXml(encryption.data),
        ns.enc,
        "EncryptedData",
      )) {
        const algorithm = elements(
          data,
          ns.enc,
          "EncryptionMethod",
        )[0]?.getAttribute("Algorithm");
        if (!algorithm || !fontObfuscation.includes(algorithm)) {
          isProtected = true;
        }
        const uri = elements(data, ns.enc, "CipherReference")[0]?.getAttribute(
          "URI",
        );
        if (uri) encrypted.add(posix.normalize(decodeURIComponent(uri)));
      }
    }
    return { entries, opfPath, opf, encrypted, isProtected };
  } catch (error) {
    if (error instanceof EpubError) throw error;
    throw new EpubError(`Unreadable EPUB: ${(error as Error).message}`);
  }
}

const metadataOf = (opf: Document) =>
  elements(opf, ns.opf, "metadata")[0] as Element;

/** EPUB 2 marks the role with opf:role, EPUB 3 with a refining meta. */
function isAuthor(creator: Element, metas: Element[]) {
  const id = creator.getAttribute("id");
  const role =
    creator.getAttributeNS(ns.opf, "role") ||
    metas.find(
      (meta) =>
        id &&
        meta.getAttribute("refines") === `#${id}` &&
        meta.getAttribute("property") === "role",
    )?.textContent;
  return !role || role.trim() === "aut";
}

/** The manifest item of the cover image, by EPUB 3 property or EPUB 2 meta. */
function coverItem(opf: Document) {
  const items = elements(opf, ns.opf, "item");
  const byProperty = items.find((item) =>
    (item.getAttribute("properties") ?? "")
      .split(/\s+/)
      .includes("cover-image"),
  );
  if (byProperty) return byProperty;
  const id = elements(opf, ns.opf, "meta")
    .find((meta) => meta.getAttribute("name") === "cover")
    ?.getAttribute("content");
  return items.find((item) => id && item.getAttribute("id") === id);
}

const resolve = (epub: Epub, href: string) =>
  posix.normalize(
    posix.join(posix.dirname(epub.opfPath), decodeURIComponent(href)),
  );

/** Reads what the package document says about the book. */
export function readEpub(bytes: Uint8Array): EpubMetadata {
  const epub = open(bytes);
  const metadata = metadataOf(epub.opf);
  const dc = (name: string) => elements(metadata, ns.dc, name);
  const metas = elements(metadata, ns.opf, "meta");

  const isbns = dc("identifier")
    .map((identifier) =>
      normalizeIsbn(
        (identifier.textContent ?? "").trim().replace(/^(urn:)?isbn:/i, ""),
      ),
    )
    .filter((isbn) => isbn !== null);

  const item = coverItem(epub.opf);
  const href = item?.getAttribute("href");
  const coverPath = href ? resolve(epub, href) : undefined;
  const cover =
    coverPath &&
    item?.getAttribute("media-type")?.startsWith("image/") &&
    !epub.encrypted.has(coverPath)
      ? (epub.entries.get(coverPath)?.data ?? null)
      : null;

  return {
    title: textOf(dc("title")[0]),
    authors: dc("creator")
      .filter((creator) => isAuthor(creator, metas))
      .map((creator) => textOf(creator))
      .filter((name) => name !== null),
    language: languageOf(textOf(dc("language")[0]) ?? undefined),
    isbns: [...new Set(isbns)],
    // Shops often put HTML into the description.
    description:
      textOf(dc("description")[0])
        ?.replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || null,
    publishedYear: yearOf(textOf(dc("date")[0]) ?? undefined),
    cover,
    isProtected: epub.isProtected,
  };
}

/** Whether the bytes are a readable EPUB (copy-protected or not). */
export function isEpub(bytes: Uint8Array) {
  try {
    open(bytes);
    return true;
  } catch (error) {
    if (error instanceof EpubError) return false;
    throw error;
  }
}

function uniqueName(
  taken: (name: string) => boolean,
  base: string,
  ext: string,
) {
  let name = `${base}${ext}`;
  for (let n = 2; taken(name); n++) name = `${base}-${n}${ext}`;
  return name;
}

/** Puts a JPEG into the EPUB and marks it as the cover image. */
function setCover(epub: Epub, jpeg: Uint8Array) {
  const opf = epub.opf;
  const current = coverItem(opf);
  const currentHref = current?.getAttribute("href");
  if (
    current &&
    currentHref &&
    current.getAttribute("media-type") === "image/jpeg" &&
    !epub.encrypted.has(resolve(epub, currentHref))
  ) {
    epub.entries.set(resolve(epub, currentHref), { data: jpeg, stored: false });
    return;
  }

  // The old image may be shown by a cover page, so it stays; only the
  // cover marking moves to the new one.
  const manifest = elements(opf, ns.opf, "manifest")[0];
  if (!manifest) throw new EpubError("No manifest in the package document");
  const ids = new Set(
    elements(opf, ns.opf, "item").map((item) => item.getAttribute("id")),
  );
  const id = uniqueName((name) => ids.has(name), "book-library-cover", "");
  const href = uniqueName(
    (name) => epub.entries.has(resolve(epub, name)),
    "book-library-cover",
    ".jpg",
  );
  const item = opf.createElementNS(
    ns.opf,
    manifest.prefix ? `${manifest.prefix}:item` : "item",
  );
  item.setAttribute("id", id);
  item.setAttribute("href", href);
  item.setAttribute("media-type", "image/jpeg");
  const version = opf.documentElement?.getAttribute("version") ?? "";
  if (version.startsWith("3")) {
    item.setAttribute("properties", "cover-image");
    if (current) {
      const rest = (current.getAttribute("properties") ?? "")
        .split(/\s+/)
        .filter((p) => p && p !== "cover-image");
      if (rest.length) current.setAttribute("properties", rest.join(" "));
      else current.removeAttribute("properties");
    }
  }
  manifest.appendChild(item);
  epub.entries.set(resolve(epub, href), { data: jpeg, stored: false });

  // EPUB 2 readers (and many EPUB 3 ones) look for this meta.
  const metadata = metadataOf(opf);
  let meta = elements(metadata, ns.opf, "meta").find(
    (m) => m.getAttribute("name") === "cover",
  );
  if (!meta) {
    meta = opf.createElementNS(
      ns.opf,
      metadata.prefix ? `${metadata.prefix}:meta` : "meta",
    );
    meta.setAttribute("name", "cover");
    metadata.appendChild(meta);
  }
  meta.setAttribute("content", id);
}

function setTitleAndAuthors(epub: Epub, title: string, authors: string[]) {
  const opf = epub.opf;
  const metadata = metadataOf(opf);
  const metas = elements(metadata, ns.opf, "meta");
  const prefix =
    elements(metadata, ns.dc, "title")[0]?.prefix ??
    elements(metadata, ns.dc, "identifier")[0]?.prefix ??
    "dc";

  let titleElement = elements(metadata, ns.dc, "title")[0];
  if (!titleElement) {
    titleElement = opf.createElementNS(ns.dc, `${prefix}:title`);
    metadata.insertBefore(titleElement, metadata.firstChild);
  }
  titleElement.textContent = title;

  for (const creator of elements(metadata, ns.dc, "creator")) {
    if (!isAuthor(creator, metas)) continue;
    const id = creator.getAttribute("id");
    for (const meta of metas) {
      if (id && meta.getAttribute("refines") === `#${id}`) {
        meta.parentNode?.removeChild(meta);
      }
    }
    creator.parentNode?.removeChild(creator);
  }
  let after: Element = titleElement;
  for (const author of authors) {
    const creator = opf.createElementNS(ns.dc, `${prefix}:creator`);
    creator.textContent = author;
    metadata.insertBefore(creator, after.nextSibling);
    after = creator;
  }
}

function zip(epub: Epub) {
  const files: Zippable = {
    // First and uncompressed, as OCF requires (EPUB 3.3, 4.3).
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
  };
  for (const [name, entry] of epub.entries) {
    if (name === "mimetype") continue;
    files[name] = [entry.data, { level: entry.stored ? 0 : 6 }];
  }
  return zipSync(files);
}

/**
 * Writes title, authors and optionally a JPEG cover into the package
 * document and returns the new file. Everything else is kept as it is.
 * Refuses copy-protected files.
 */
export function writeEpub(
  bytes: Uint8Array,
  book: { title: string; authors: string[]; cover?: Uint8Array },
) {
  const epub = open(bytes);
  if (epub.isProtected) throw new EpubError("The EPUB is copy-protected");
  setTitleAndAuthors(epub, book.title, book.authors);
  if (book.cover) setCover(epub, book.cover);
  epub.entries.set(epub.opfPath, {
    data: strToU8(new XMLSerializer().serializeToString(epub.opf)),
    stored: epub.entries.get(epub.opfPath)?.stored ?? false,
  });
  return zip(epub);
}
