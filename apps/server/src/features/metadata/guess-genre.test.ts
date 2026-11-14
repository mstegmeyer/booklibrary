import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRecords } from "./dnb.ts";
import { type GenreKey, guessGenre } from "./guess-genre.ts";
import { parseBook } from "./open-library.ts";

const fixture = (name: string) => {
  const file = join(import.meta.dirname, "fixtures", name);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

/** The categories and subtitle the recorded DNB and Open Library answers give. */
function recorded(isbn: string) {
  const dnbXml = fixture(`dnb-isbn-${isbn}.xml`);
  const olJson = fixture(`openlibrary-isbn-${isbn}.json`);
  const dnb = dnbXml ? parseRecords(dnbXml)[0] : undefined;
  const ol = olJson ? parseBook(JSON.parse(olJson), isbn) : null;
  return {
    categories: [...(dnb?.categories ?? []), ...(ol?.categories ?? [])],
    subtitle: dnb?.subtitle ?? ol?.subtitle ?? null,
  };
}

describe("guessing the genre of real books", () => {
  it.each<[string, string, GenreKey | null]>([
    ["9783957334466", "1000 places to see before you die", "travel-guide"],
    ["9783897484832", "Kochen mit Bibi Blocksberg", "cookbook"],
    // The trade's product group says crime, every other signal historical.
    ["9783442492114", "Der Teepalast", "historical-novel"],
    ["9783749902484", "Bridgerton: Der Duke und ich", "historical-novel"],
    ["9783499271106", "Die Früchte, die man erntet", "crime"],
    ["9783453432413", "Das Bourne-Vermächtnis", "thriller"],
    ["9781409150541", "Deal Breaker", "crime"],
    ["9780525509028", "Born a Crime", "biography"],
    ["9781640973985", "Fodor's San Francisco", "travel-guide"],
    // Generic fiction codes; police procedural and crime terms outweigh "Thriller".
    ["9783550202995", "Views", "crime"],
    ["9783442774241", "Zwischen Welten", "novel"],
    ["9783426515198", "Eiszeit", "thriller"],
    // A love story among other keywords is not enough to leave "novel".
    ["9783492059145", "Sommergäste", "novel"],
  ])("%s %s: %s", (isbn, _title, expected) => {
    const { categories, subtitle } = recorded(isbn);
    expect(categories.length + (subtitle ? 1 : 0)).toBeGreaterThan(0);
    expect(guessGenre(categories, subtitle).genre).toBe(expected);
  });
});

describe("guessGenre", () => {
  it.each<[string, string[], string | null, GenreKey | null]>([
    ["nothing", [], null, null],
    [
      "only words that name no genre",
      ["Fiktionale Darstellung", "(Produktform)Book", "Berlin"],
      null,
      null,
    ],
    [
      "the product group of the trade",
      ["(VLB-WN)1310: Hardcover, Softcover / Reisen/Reiseführer"],
      null,
      "travel-guide",
    ],
    ["a BISAC code", ["(BISAC Subject Heading)CKB101000"], null, "cookbook"],
    [
      "a single subject when nothing else is said",
      ["Travel"],
      null,
      "travel-guide",
    ],
    [
      "the genre printed on the cover",
      [],
      "ein Fall für Carol Jordan und Tony Hill ; Thriller",
      "thriller",
    ],
    ["the subtitle's last part only", ["Liebesgeschichte"], "Roman", "novel"],
    [
      "crime and thriller in one group, tied",
      ["Krimis, Thriller, Spionage"],
      null,
      "crime",
    ],
    [
      "thriller over crime when more signals say so",
      ["Krimis, Thriller, Spionage", "Politthriller"],
      null,
      "thriller",
    ],
    [
      "Scandinavian crime in compounds",
      ["Schwedenkrimi", "Skandinavien-Krimi"],
      null,
      "crime",
    ],
    // Two genres with equal weight: no guess rather than a coin toss.
    [
      "a tie between unrelated genres",
      ["Kochbuch", "Kindersachbuch"],
      null,
      null,
    ],
    [
      "a tie that does not reach the threshold falls back to novel",
      ["Liebesgeschichte", "Biografie", "Erzählende Literatur"],
      null,
      "novel",
    ],
    [
      "crime and thriller together outweigh a third genre",
      [
        "(VLB-WN)2121: Taschenbuch / Belletristik/Krimis, Thriller, Spionage",
        "Thriller",
        "Historische Romane und Erzählungen",
        "Historischer Roman",
      ],
      null,
      "thriller",
    ],
    [
      "true crime is not crime fiction",
      ["True crime", "(BISAC Subject Heading)TRU002000"],
      null,
      "non-fiction",
    ],
    [
      "a code repeated with its heading counts once",
      [
        "(BISAC Subject Heading)FIC000000",
        "(BISAC Subject Heading)FIC000000: FICTION / General",
        "Liebesroman",
        "Romance",
      ],
      null,
      "romance",
    ],
    ["biographical novels stay novels", ["biografischer Roman"], null, "novel"],
  ])("%s", (_name, categories, subtitle, expected) => {
    expect(guessGenre(categories, subtitle).genre).toBe(expected);
  });

  it("names the categories that decided", () => {
    expect(
      guessGenre(["Reiseführer", "Berlin", "(BISAC Subject Heading)TRV009000"])
        .signals,
    ).toEqual(["Reiseführer", "(BISAC Subject Heading)TRV009000"]);
  });
});
