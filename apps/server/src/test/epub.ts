import { strToU8, type Zippable, zipSync } from "fflate";
import sharp from "sharp";

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A small image for covers. */
export const image = (format: "png" | "jpeg", color = "#6e2f2a") =>
  sharp({
    create: { width: 60, height: 90, channels: 3, background: color },
  })
    [format]()
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));

/**
 * Builds a minimal EPUB in memory. EPUB 3 marks roles and the cover with
 * refining metas and properties, EPUB 2 with attributes and a cover meta.
 */
export function buildEpub(
  options: {
    version?: 2 | 3;
    title?: string;
    authors?: string[];
    /** Creators that are not authors, such as a translator. */
    others?: string[];
    isbn?: string;
    language?: string;
    description?: string;
    date?: string;
    cover?: { data: Uint8Array; type: "image/png" | "image/jpeg" };
    encryption?: "fonts" | "drm";
  } = {},
) {
  const version = options.version ?? 3;
  const creators = [
    ...(options.authors ?? []).map((name, i) =>
      version === 3
        ? `<dc:creator id="aut${i}">${escapeXml(name)}</dc:creator><meta refines="#aut${i}" property="role" scheme="marc:relators">aut</meta><meta refines="#aut${i}" property="file-as">${escapeXml(name)}</meta>`
        : `<dc:creator opf:role="aut">${escapeXml(name)}</dc:creator>`,
    ),
    ...(options.others ?? []).map((name, i) =>
      version === 3
        ? `<dc:creator id="trl${i}">${escapeXml(name)}</dc:creator><meta refines="#trl${i}" property="role" scheme="marc:relators">trl</meta>`
        : `<dc:creator opf:role="trl">${escapeXml(name)}</dc:creator>`,
    ),
  ].join("");
  const coverExt = options.cover?.type === "image/png" ? "png" : "jpg";
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:3b1f6a2e-8a5c-4d4e-9b8a-1c2d3e4f5a6b</dc:identifier>
${options.isbn ? `<dc:identifier>urn:isbn:${options.isbn}</dc:identifier>` : ""}
${options.title === undefined ? "" : `<dc:title>${escapeXml(options.title)}</dc:title>`}
${creators}
${options.language ? `<dc:language>${options.language}</dc:language>` : ""}
${options.description ? `<dc:description>${escapeXml(options.description)}</dc:description>` : ""}
${options.date ? `<dc:date>${options.date}</dc:date>` : ""}
<dc:publisher>Kept Publisher</dc:publisher>
${options.cover && version === 2 ? `<meta name="cover" content="cover-img"/>` : ""}
</metadata>
<manifest>
<item id="text" href="text/chapter.xhtml" media-type="application/xhtml+xml"/>
<item id="font" href="fonts/serif.otf" media-type="font/otf"/>
${options.cover ? `<item id="cover-img" href="images/cover.${coverExt}" media-type="${options.cover.type}"${version === 3 ? ` properties="cover-image"` : ""}/>` : ""}
</manifest>
<spine><itemref idref="text"/></spine>
</package>`;

  const encryptedFile =
    options.encryption === "drm"
      ? "OEBPS/text/chapter.xhtml"
      : "OEBPS/fonts/serif.otf";
  const algorithm =
    options.encryption === "drm"
      ? "http://www.w3.org/2001/04/xmlenc#aes128-cbc"
      : "http://www.idpf.org/2008/embedding";

  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    ...(options.encryption && {
      "META-INF/encryption.xml": strToU8(
        `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="${encryptedFile}"/></enc:CipherData></enc:EncryptedData></encryption>`,
      ),
    }),
    "OEBPS/content.opf": strToU8(opf),
    "OEBPS/text/chapter.xhtml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><p>Once upon a time.</p></body></html>`,
    ),
    "OEBPS/fonts/serif.otf": strToU8("not really a font"),
    ...(options.cover && {
      [`OEBPS/images/cover.${coverExt}`]: [options.cover.data, { level: 0 }],
    }),
  };
  return zipSync(files);
}

/** A minimal PDF; nothing is read from it. */
export const buildPdf = (text = "A book") =>
  strToU8(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${text}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
