import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { SelectField } from "../../components/ui/select";
import { useSortedGenres } from "./queries";

/** "No genre" first (the empty value), then the genres alphabetically. */
export function GenreSelect(props: Omit<ComponentProps<"select">, "children">) {
  const { t } = useTranslation("genres");
  const genres = useSortedGenres();
  return (
    // Remounted once the genres arrive, so a `defaultValue` finds its option.
    <SelectField key={genres.length} label={t("genre")} {...props}>
      <option value="">{t("none")}</option>
      {genres.map((genre) => (
        <option key={genre.id} value={genre.id}>
          {genre.label}
        </option>
      ))}
    </SelectField>
  );
}
