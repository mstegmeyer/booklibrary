import { useTranslation } from "react-i18next";

/** Formatters for the active language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  return {
    date: (value: number | Date) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value),
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
    fileSize: (bytes: number) =>
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit: bytes < 1_000_000 ? "kilobyte" : "megabyte",
        maximumFractionDigits: 1,
      }).format(bytes < 1_000_000 ? bytes / 1000 : bytes / 1_000_000),
    /** The name of a BCP 47 language; a code Intl rejects stays as it is. */
    language: (code: string) => {
      try {
        return new Intl.DisplayNames(locale, { type: "language" }).of(code);
      } catch {
        return code;
      }
    },
  };
}
