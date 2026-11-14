import { queryOptions, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, unwrap } from "../../lib/api";
import type genresLocale from "../../locales/en/genres";

const fetchGenres = async () => (await unwrap(api.genres.$get())).items;

export const genresQuery = queryOptions({
  queryKey: ["genres"],
  queryFn: fetchGenres,
});

export type Genre = Awaited<ReturnType<typeof fetchGenres>>[number];
export type GenreRef = Pick<Genre, "id" | "key" | "name">;
type BuiltInKey = keyof typeof genresLocale.builtIn;

/**
 * A genre's name as people see it: a built-in one in the interface language
 * until someone renames it.
 */
export function useGenreName() {
  const { t } = useTranslation("genres");
  return (genre: GenreRef) =>
    genre.name ?? t(`builtIn.${genre.key as BuiltInKey}`);
}

/** Every genre with its displayed name, alphabetical in the interface language. */
export function useSortedGenres() {
  const { i18n } = useTranslation();
  const genreName = useGenreName();
  const { data: genres = [] } = useQuery(genresQuery);
  const collator = new Intl.Collator(i18n.resolvedLanguage);
  return genres
    .map((genre) => ({ ...genre, label: genreName(genre) }))
    .sort((a, b) => collator.compare(a.label, b.label));
}
