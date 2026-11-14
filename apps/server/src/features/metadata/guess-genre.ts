// Guesses one of the built-in genres from the categories the catalogues send:
// the DNB's genre terms, subject headings and keywords (among them the book
// trade's product group and BISAC codes), Open Library's subjects, Google's
// categories, and the subtitle as printed on the cover.

export type GenreKey =
  | "novel"
  | "crime"
  | "thriller"
  | "fantasy"
  | "science-fiction"
  | "historical-novel"
  | "romance"
  | "horror"
  | "humour"
  | "classic"
  | "childrens-book"
  | "young-adult"
  | "comic"
  | "poetry-drama"
  | "non-fiction"
  | "biography"
  | "history"
  | "politics-society"
  | "science-nature"
  | "guide"
  | "cookbook"
  | "travel-guide"
  | "art-photography"
  | "reference";

type Rule = [RegExp, GenreKey[]];

// Tried in order; the first match decides what a category says, so the more
// specific terms come first and the generic "novel" last.
const terms: Rule[] = [
  [/true crime/, ["non-fiction"]],
  [/krimis, thriller/, ["crime", "thriller"]],
  [/biografischer roman|romanbiografie/, ["novel"]],
  [
    /kriminalrom|krimis?\b|\bdetective|\bdetektiv|\bmyster|\bcrime\b/,
    ["crime"],
  ],
  [/thriller|\bspannung\b|suspense|spionage|espionage/, ["thriller"]],
  [/liebesrom|liebesgeschicht|\bromance\b|love stor/, ["romance"]],
  [/historische[rn]? rom|historical (fiction|novel)/, ["historical-novel"]],
  [/science.?fiction/, ["science-fiction"]],
  [/fantasy/, ["fantasy"]],
  [/horror/, ["horror"]],
  [/\bcomics?\b|graphic novel|\bmanga\b/, ["comic"]],
  [
    /kinderbuch|kindersachbuch|bilderbuch|\bjuvenile|\bchildren/,
    ["childrens-book"],
  ],
  [/jugendbuch|young adult/, ["young-adult"]],
  [
    /kochb(uch|ücher)|backbuch|rezepte|cookbook|cookery|\bcooking\b|recipes/,
    ["cookbook"],
  ],
  [/reiseführer|reisefuehrer|\bführer\b|guidebook|^travel\b/, ["travel-guide"]],
  [/biografie|biographie|biograph(y|ies)|autobiograph|memoir/, ["biography"]],
  [/\bhumou?r\b|satire|kabarett/, ["humour"]],
  [/\blyrik\b|gedichte|poetry|\bdrama\b|dramatik/, ["poetry-drama"]],
  [/klassiker|\bclassics?\b/, ["classic"]],
  [/ratgeber|lebenshilfe|self-help|selbsthilfe/, ["guide"]],
  [/\bgeschichte\b|\bhistory\b/, ["history"]],
  [
    /\bpolitik\b|\bpolitics\b|political|\bgesellschaft\b|social (conditions|science)|soziologie/,
    ["politics-society"],
  ],
  [/naturwissenschaft|\bscience\b|\bnature\b/, ["science-nature"]],
  [/\bkunst\b|fotografie|photography|bildband|\bart\b/, ["art-photography"]],
  [
    /lexikon|lexika|wörterbuch|nachschlagewerk|\breference\b|dictionar|encyclop/,
    ["reference"],
  ],
  [/sachbuch|non-?fiction/, ["non-fiction"]],
  [
    /\broman\b|\bromane\b|erzählende literatur|gegenwartsliteratur|\bfiction\b|\bnovels?\b|belletristik/,
    ["novel"],
  ],
];

/**
 * The book trade's product group (Warengruppen-Systematik 2.1 of the VLB): the
 * three digits after the product form.
 */
function productGroup(group: number): GenreKey[] {
  const between = (from: number, to: number) => group >= from && group <= to;
  if (between(110, 112) || between(145, 147)) return ["novel"];
  if (group === 113) return ["historical-novel"];
  if (group === 120) return ["thriller"];
  if (group === 121) return ["crime", "thriller"];
  if (group === 122) return ["crime"];
  if (group === 123) return ["horror"];
  if (group === 130) return ["science-fiction", "fantasy"];
  if (group === 131) return ["science-fiction"];
  if (between(132, 133)) return ["fantasy"];
  if (between(141, 142) || between(170, 179)) return ["romance"];
  if (group === 144 || group === 185) return ["humour"];
  if (between(150, 152)) return ["poetry-drama"];
  if (between(180, 183)) return ["comic"];
  if (between(220, 229) || group === 260) return ["young-adult"];
  if (between(210, 299)) return ["childrens-book"];
  if (between(310, 339)) return ["travel-guide"];
  if (group === 360) return ["non-fiction"];
  if (between(450, 459)) return ["cookbook"];
  if (between(410, 499)) return ["guide"];
  if (between(550, 559) || between(940, 949)) return ["history"];
  if (between(580, 589) || between(950, 955)) return ["art-photography"];
  if (between(610, 699) || between(980, 989)) return ["science-nature"];
  if (between(710, 759) || between(780, 789) || between(970, 979)) {
    return ["politics-society"];
  }
  if (between(910, 919)) return ["reference"];
  // In the non-fiction groups 920 to 980 the first subgroup holds biographies.
  if (between(920, 989) && group % 10 === 1) return ["biography"];
  if (between(510, 799) || between(920, 999)) return ["non-fiction"];
  return [];
}

/** BISAC subject codes of the Book Industry Study Group. */
function bisac(code: string): GenreKey[] {
  const section = code.slice(0, 3);
  const subject = code.slice(3, 6);
  if (section === "FIC") {
    if (subject === "014") return ["historical-novel"];
    if (subject === "022" || subject === "050") return ["crime"];
    if (["031", "030", "006", "036"].includes(subject)) return ["thriller"];
    if (subject === "027" && code !== "FIC027040") return ["romance"];
    if (subject === "009") return ["fantasy"];
    if (subject === "028") return ["science-fiction"];
    if (subject === "015") return ["horror"];
    if (subject === "016" || subject === "060") return ["humour"];
    if (subject === "004") return ["classic"];
    if (subject === "000" || subject === "019") return ["novel"];
    return [];
  }
  if (section === "TRV") {
    return code === "TRV010000" ? ["non-fiction"] : ["travel-guide"];
  }
  const sections: Record<string, GenreKey[]> = {
    BIO: ["biography"],
    CKB: ["cookbook"],
    JUV: ["childrens-book"],
    JNF: ["childrens-book"],
    YAF: ["young-adult"],
    YAN: ["young-adult"],
    CGN: ["comic"],
    POE: ["poetry-drama"],
    DRA: ["poetry-drama"],
    HIS: ["history"],
    POL: ["politics-society"],
    SOC: ["politics-society"],
    SCI: ["science-nature"],
    NAT: ["science-nature"],
    ART: ["art-photography"],
    PHO: ["art-photography"],
    REF: ["reference"],
    HUM: ["humour"],
    SEL: ["guide"],
    LCO: [],
  };
  return sections[section] ?? ["non-fiction"];
}

const normalized = (category: string) =>
  category.normalize("NFC").toLowerCase().trim();
const productGroupOf = (text: string) => /^\(vlb-wn\)\d(\d{3})/.exec(text)?.[1];
const bisacOf = (text: string) =>
  /^\(bisac subject heading\)([a-z]{3}\d{6})/.exec(text)?.[1]?.toUpperCase();

function genresOf(category: string): GenreKey[] {
  const text = normalized(category);
  const group = productGroupOf(text);
  if (group) return productGroup(Number(group));
  const code = bisacOf(text);
  if (code) return bisac(code);
  return terms.find(([pattern]) => pattern.test(text))?.[1] ?? [];
}

/** The DNB repeats a code with and without its heading; it counts once. */
function identity(category: string) {
  const text = normalized(category);
  return productGroupOf(text) ?? bisacOf(text) ?? text;
}

/** What a category says counts this much; the cover's own word counts more. */
const categoryWeight = 2;
const subtitleWeight = 3;
/** A genre needs two signals, or the subtitle, unless nothing else is said. */
const enough = 3;

// The German trade keeps crime and thriller in one group, and the sources
// mix them freely, so the two compete with other genres as one.
const suspense: GenreKey[] = ["crime", "thriller"];

export type GenreGuess = {
  genre: GenreKey | null;
  /** The categories that pointed to the genre, for checking a guess. */
  signals: string[];
};

/**
 * The built-in genre the categories make reasonably clear, or null. The
 * generic "novel" is only chosen when nothing more specific stands out.
 */
export function guessGenre(
  categories: string[],
  subtitle: string | null = null,
): GenreGuess {
  const scores = new Map<GenreKey, number>();
  const signals = new Map<GenreKey, string[]>();
  const add = (text: string, weight: number) => {
    for (const genre of genresOf(text)) {
      scores.set(genre, (scores.get(genre) ?? 0) + weight);
      signals.set(genre, [...(signals.get(genre) ?? []), text]);
    }
  };
  const seen = new Set<string>();
  for (const category of categories) {
    const key = identity(category);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    add(category.trim(), categoryWeight);
  }
  // "ein Fall für Sebastian Bergmann : Kriminalroman": the genre comes last.
  const printed = subtitle?.split(/[:;]/).at(-1)?.trim();
  if (printed) add(printed, subtitleWeight);

  const score = (genre: GenreKey) => scores.get(genre) ?? 0;
  const units: { genres: GenreKey[]; score: number }[] = [
    { genres: suspense, score: score("crime") + score("thriller") },
    ...[...scores.keys()]
      .filter((genre) => genre !== "novel" && !suspense.includes(genre))
      .map((genre) => ({ genres: [genre], score: score(genre) })),
  ]
    .filter((unit) => unit.score > 0)
    .sort((a, b) => b.score - a.score);
  const [best, second] = units;
  const result = (genre: GenreKey | null): GenreGuess => ({
    genre,
    signals: genre ? (signals.get(genre) ?? []) : [],
  });

  if (best) {
    const alone = units.length === 1 && score("novel") === 0;
    const clear = best.score > (second?.score ?? 0);
    if ((best.score >= enough || alone) && clear) {
      // A tie inside the group goes to crime, the broader of the two.
      const [first, other] = best.genres;
      return result(
        other && score(other) > score(first ?? other) ? other : (first ?? null),
      );
    }
    if (best.score >= enough) return result(null);
  }
  return result(score("novel") >= categoryWeight ? "novel" : null);
}
