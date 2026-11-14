const isbn10Check = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
};

const isbn13Check = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
};

/**
 * Accepts ISBN-10 or ISBN-13 with or without hyphens and spaces and returns
 * the ISBN-13, or null when the input is not a valid ISBN.
 */
export function normalizeIsbn(input: string): string | null {
  const value = input.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(value)) {
    if (isbn10Check(value) !== value[9]) return null;
    const twelve = `978${value.slice(0, 9)}`;
    return twelve + isbn13Check(twelve);
  }
  if (/^97[89]\d{10}$/.test(value)) {
    return isbn13Check(value) === value[12] ? value : null;
  }
  return null;
}
