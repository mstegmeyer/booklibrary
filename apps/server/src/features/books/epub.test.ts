import { strFromU8, unzipSync, zipSync } from "fflate";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildEpub, image } from "../../test/epub.ts";
import { EpubError, isEpub, readEpub, writeEpub } from "./epub.ts";

/** The local file header of the first ZIP entry. */
function firstEntry(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const nameLength = view.getUint16(26, true);
  return {
    signature: view.getUint32(0, true),
    flags: view.getUint16(6, true),
    method: view.getUint16(8, true),
    extraLength: view.getUint16(28, true),
    name: strFromU8(bytes.subarray(30, 30 + nameLength)),
    content: strFromU8(bytes.subarray(30 + nameLength, 30 + nameLength + 20)),
  };
}

function expectValidContainer(bytes: Uint8Array) {
  expect(firstEntry(bytes)).toEqual({
    signature: 0x04034b50,
    flags: 0,
    method: 0,
    extraLength: 0,
    name: "mimetype",
    content: "application/epub+zip",
  });
}

describe.each([2, 3] as const)("EPUB %i", (version) => {
  it("reads title, authors, language, ISBN, description, year and cover", async () => {
    const cover = await image("png");
    const meta = readEpub(
      buildEpub({
        version,
        title: "The Name of the Rose",
        authors: ["Umberto Eco"],
        others: ["William Weaver"],
        isbn: "978-0-15-600131-1",
        language: "en",
        description: "<p>A <b>monastery</b> mystery.</p>",
        date: "1983-01-01",
        cover: { data: cover, type: "image/png" },
      }),
    );
    expect(meta).toEqual({
      title: "The Name of the Rose",
      authors: ["Umberto Eco"],
      language: "en",
      isbns: ["9780156001311"],
      description: "A monastery mystery.",
      publishedYear: 1983,
      cover,
      isProtected: false,
    });
  });

  it("writes title, authors and cover and reads them again", async () => {
    const original = buildEpub({
      version,
      title: "Old title",
      authors: ["Someone Else"],
      others: ["William Weaver"],
      cover: { data: await image("png"), type: "image/png" },
    });
    const jpeg = await image("jpeg", "#1f6b52");

    const written = writeEpub(original, {
      title: "Der Name der Rose",
      authors: ["Umberto Eco", "Burkhart Kroeber"],
      cover: jpeg,
    });

    const meta = readEpub(written);
    expect(meta.title).toBe("Der Name der Rose");
    expect(meta.authors).toEqual(["Umberto Eco", "Burkhart Kroeber"]);
    expect(meta.cover).toEqual(jpeg);
    expectValidContainer(written);

    const files = unzipSync(written);
    const opf = strFromU8(files["OEBPS/content.opf"] as Uint8Array);
    // Other metadata, creators and resources are kept.
    expect(opf).toContain("Kept Publisher");
    expect(opf).toContain("William Weaver");
    expect(opf).not.toContain("Someone Else");
    expect(files["OEBPS/images/cover.png"]).toBeDefined();
    expect(
      strFromU8(files["OEBPS/text/chapter.xhtml"] as Uint8Array),
    ).toContain("Once upon a time.");
    expect(Object.keys(files)).toEqual([
      "mimetype",
      "META-INF/container.xml",
      "OEBPS/content.opf",
      "OEBPS/text/chapter.xhtml",
      "OEBPS/fonts/serif.otf",
      "OEBPS/images/cover.png",
      "OEBPS/book-library-cover.jpg",
    ]);
  });
});

it("replaces a JPEG cover in place", async () => {
  const original = buildEpub({
    title: "Dune",
    cover: { data: await image("jpeg"), type: "image/jpeg" },
  });
  const jpeg = await image("jpeg", "#2e4a62");
  const written = writeEpub(original, {
    title: "Dune",
    authors: ["Frank Herbert"],
    cover: jpeg,
  });
  expect(unzipSync(written)["OEBPS/images/cover.jpg"]).toEqual(jpeg);
  expect(Object.keys(unzipSync(written))).not.toContain(
    "OEBPS/book-library-cover.jpg",
  );
});

it("adds a cover to a book without one", async () => {
  const jpeg = await image("jpeg");
  const written = writeEpub(buildEpub({ version: 2, title: "Momo" }), {
    title: "Momo",
    authors: ["Michael Ende"],
    cover: jpeg,
  });
  const cover = readEpub(written).cover;
  expect(cover).toEqual(jpeg);
  expect((await sharp(cover as Uint8Array).metadata()).format).toBe("jpeg");
});

it("fixes a mimetype entry that is not first or is compressed", () => {
  const { mimetype, ...rest } = unzipSync(buildEpub({ title: "A" }));
  const sloppy = zipSync({
    ...rest,
    mimetype: [mimetype as Uint8Array, { level: 9 }],
  });
  expect(firstEntry(sloppy).name).not.toBe("mimetype");

  const written = writeEpub(sloppy, { title: "B", authors: [] });
  expectValidContainer(written);
  expect(readEpub(written).title).toBe("B");
});

it("does not mistake obfuscated fonts for copy protection", () => {
  const epub = buildEpub({ title: "Fonts", encryption: "fonts" });
  expect(readEpub(epub).isProtected).toBe(false);
  expect(() => writeEpub(epub, { title: "Fonts", authors: [] })).not.toThrow();
});

it("recognises copy protection and refuses to write", async () => {
  const epub = buildEpub({
    title: "Locked",
    authors: ["A. Author"],
    cover: { data: await image("jpeg"), type: "image/jpeg" },
    encryption: "drm",
  });
  const meta = readEpub(epub);
  expect(meta).toMatchObject({
    title: "Locked",
    authors: ["A. Author"],
    isProtected: true,
  });
  expect(meta.cover).not.toBeNull();
  expect(() => writeEpub(epub, { title: "X", authors: [] })).toThrow(EpubError);
});

it("tells EPUBs from other files", () => {
  expect(isEpub(buildEpub({ title: "A" }))).toBe(true);
  expect(isEpub(new TextEncoder().encode("%PDF-1.4"))).toBe(false);
});
