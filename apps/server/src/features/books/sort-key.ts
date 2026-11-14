const particles = new Set([
  "da",
  "de",
  "del",
  "della",
  "der",
  "di",
  "du",
  "la",
  "le",
  "ten",
  "ter",
  "van",
  "von",
  "zu",
]);

/**
 * A best guess at how the first author sorts: "Ursula K. Le Guin" becomes
 * "Le Guin, Ursula K.". Name particles stay with the surname. A single name,
 * or one already written with a comma, is kept as it is.
 */
export function guessSortKey(authors: string[]) {
  const name = authors[0]?.trim() ?? "";
  if (name.includes(",")) return name;
  const words = name.split(/\s+/);
  let start = words.length - 1;
  while (start > 1 && particles.has(words[start - 1]?.toLowerCase() ?? ""))
    start--;
  if (start < 1) return name;
  return `${words.slice(start).join(" ")}, ${words.slice(0, start).join(" ")}`;
}
