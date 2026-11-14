/** Returns the ISBN-13 for a valid ISBN-10 or ISBN-13, otherwise null. */
export function normaliseIsbn(input: string): string | null {
  const isbn = input.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (acc, ch, i) => acc + (ch === "X" ? 10 : Number(ch)) * (10 - i),
      0,
    );
    if (sum % 11 !== 0) return null;
    const body = `978${isbn.slice(0, 9)}`;
    return body + isbn13CheckDigit(body);
  }
  if (/^97[89]\d{10}$/.test(isbn)) {
    return isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12] ? isbn : null;
  }
  return null;
}

function isbn13CheckDigit(body: string) {
  const sum = [...body].reduce(
    (acc, ch, i) => acc + Number(ch) * (i % 2 ? 3 : 1),
    0,
  );
  return String((10 - (sum % 10)) % 10);
}

/** 978-3 is the registration group of the German-speaking countries. */
export const isGermanLanguageGroup = (isbn13: string) =>
  isbn13.startsWith("9783");
