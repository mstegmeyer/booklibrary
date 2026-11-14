// Guesses a copy's binding from what the catalogues state about the edition:
// the DNB's terms of availability ("Broschur : EUR 16.00"), its product form
// keywords and the book trade's product group, and Open Library's free-text
// physical format.

export type Binding = "paperback" | "hardcover";

const rules: [RegExp, Binding | null][] = [
  // DNB terms of availability, the part before " : ".
  [/^(broschur|kart\.)/, "paperback"],
  [/^(festeinband|pp\.|gb\.|geb\.)/, "hardcover"],
  // ONIX product forms in the DNB's keywords: BC paperback, BB hardback.
  [/^\(produktform\)paperback|^\(vlb-pf\)bc\b/, "paperback"],
  [/^\(produktform\)hardback|^\(vlb-pf\)bb\b/, "hardcover"],
  // In the book trade's product group, 2 is "Taschenbuch"; 1 says nothing.
  [/^\(vlb-wn\)2\d{3}/, "paperback"],
  [/^\(vlb-wn\)/, null],
  // Open Library's physical format, as people typed it.
  [/paperback|softcover|taschenbuch|broschiert/, "paperback"],
  [/hardcover|hardback|hard cover|gebunden/, "hardcover"],
];

/** The binding the statements agree on; null when none is stated or they disagree. */
export function guessBinding(statements: string[]): Binding | null {
  const found = new Set(
    statements.flatMap((statement) => {
      const text = statement.normalize("NFC").toLowerCase().trim();
      const rule = rules.find(([pattern]) => pattern.test(text));
      return rule?.[1] ? [rule[1]] : [];
    }),
  );
  return found.size === 1 ? ([...found][0] ?? null) : null;
}
