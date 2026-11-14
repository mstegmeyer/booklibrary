import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRecords } from "./dnb.ts";
import { type Binding, guessBinding } from "./guess-binding.ts";
import { parseBook } from "./open-library.ts";

const fixture = (name: string) => {
  const file = join(import.meta.dirname, "fixtures", name);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

/** The binding statements of the recorded DNB and Open Library answers. */
function recorded(isbn: string) {
  const dnbXml = fixture(`dnb-isbn-${isbn}.xml`);
  const olJson = fixture(`openlibrary-isbn-${isbn}.json`);
  return [
    ...(dnbXml ? (parseRecords(dnbXml)[0]?.bindings ?? []) : []),
    ...(olJson ? (parseBook(JSON.parse(olJson), isbn)?.bindings ?? []) : []),
  ];
}

describe("guessing the binding of real books", () => {
  it.each<[string, string, Binding | null]>([
    ["9783492059145", "Festeinband, Hardback", "hardcover"],
    ["9783550202995", "Festeinband, Hardback", "hardcover"],
    ["9783897484832", "Pp. (Pappband)", "hardcover"],
    ["9783442492114", "Broschur, Paperback, product group 2", "paperback"],
    ["9783499271106", "Broschur, Paperback, product group 2", "paperback"],
    ["9783749902484", "Broschur, Paperback, product group 2", "paperback"],
    ["9783453432413", "kart., VLB-PF BC, product group 2", "paperback"],
    ["9783426515198", "kart., Paperback, Open Library paperback", "paperback"],
    ["9783442774241", "Broschur, Open Library Taschenbuch", "paperback"],
    // "(Produktform)Book" and product group 1 say nothing; Broschur does.
    ["9783957334466", "Broschur", "paperback"],
    ["9780525509028", "Open Library paperback", "paperback"],
    ["9781409150541", "nothing stated", null],
    ["9781640973985", "nothing stated", null],
  ])("%s (%s): %s", (isbn, _signals, expected) => {
    expect(guessBinding(recorded(isbn))).toBe(expected);
  });
});

describe("guessBinding", () => {
  it.each<[string, string[], Binding | null]>([
    ["nothing", [], null],
    ["a statement that says nothing", ["(Produktform)Book"], null],
    [
      "product group 1, hardcover or softcover",
      ["(VLB-WN)1112: Hardcover, Softcover / Belletristik"],
      null,
    ],
    ["Gb.", ["Gb."], "hardcover"],
    ["geb.", ["geb."], "hardcover"],
    ["ONIX hardback", ["(VLB-PF)BB: Hardback"], "hardcover"],
    ["Open Library's free text", ["Mass Market Paperback"], "paperback"],
    ["Gebundene Ausgabe", ["Gebundene Ausgabe"], "hardcover"],
    ["statements that disagree", ["Broschur", "Hardcover"], null],
    [
      "agreeing statements",
      ["kart.", "(Produktform)Paperback / softback", "paperback"],
      "paperback",
    ],
  ])("%s", (_name, statements, expected) => {
    expect(guessBinding(statements)).toBe(expected);
  });
});
