import { useTranslation } from "react-i18next";

/** Formatters for the active language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  return {
    date: (value: number | Date) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value),
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
  };
}
