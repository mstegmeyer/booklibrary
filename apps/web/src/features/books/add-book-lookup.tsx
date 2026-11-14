import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Field, FormError } from "../../components/ui/field";
import { ApiError } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { BookCover } from "./book-cover";
import { type Candidate, lookupIsbn, searchCatalogues } from "./queries";

type LookupProps = {
  /** "Not the right book?": correct the result by hand. */
  onNotRight: (candidate: Candidate) => void;
  /** Manual entry, with the ISBN when there is one. */
  onManual: (isbn?: string) => void;
  /** A book was found or picked. */
  onFound: (candidate: Candidate) => void;
  /** The ownership and the add buttons for the chosen book. */
  children: (candidate: Candidate) => ReactNode;
};

const errorCode = (error: Error | null) =>
  error instanceof ApiError ? error.code : undefined;

/** The lookup errors shown with their own message. */
const lookupCodes = [
  "invalid_isbn",
  "metadata_not_found",
  "metadata_unavailable",
];

/** Look a book up by its ISBN. */
export function IsbnLookup({
  onNotRight,
  onManual,
  onFound,
  children,
}: LookupProps) {
  const { t } = useTranslation("books");
  const id = useId();
  const [isbn, setIsbn] = useState("");
  const lookup = useMutation({
    mutationFn: (value: string) => lookupIsbn(value.replace(/\s/g, "")),
    onSuccess: onFound,
  });
  const code = errorCode(lookup.error);
  const manual = (
    <Button variant="secondary" onClick={() => onManual(isbn.trim())}>
      {t("lookup.enterManually")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isbn.trim()) lookup.mutate(isbn);
        }}
        className="flex flex-col gap-1.5"
      >
        <label
          htmlFor={id}
          className="font-semibold text-[13px] leading-[18px]"
        >
          {t("lookup.isbn")}
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            value={isbn}
            onChange={(event) => setIsbn(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            // Opening the dialog and "Add and enter next" start typing here.
            // biome-ignore lint/a11y/noAutofocus: the field is the dialog's purpose
            autoFocus
            aria-invalid={code === "invalid_isbn"}
            aria-describedby={
              code === "invalid_isbn" ? `${id}-error` : undefined
            }
            className="h-10 min-w-0 flex-1 rounded-lg border border-control bg-surface px-3 text-ink text-sm tabular-nums"
          />
          <Button type="submit" variant="secondary" disabled={lookup.isPending}>
            {t("lookup.lookUp")}
          </Button>
        </div>
        {code === "invalid_isbn" && (
          <p id={`${id}-error`} role="alert" className="text-danger text-sm">
            {t("lookup.invalid")}
          </p>
        )}
      </form>
      {lookup.isPending && (
        <p role="status" className="text-ink-muted text-sm">
          {t("lookup.searching")}
        </p>
      )}
      {code === "metadata_not_found" && (
        <Problem text={t("lookup.notFound")}>{manual}</Problem>
      )}
      {code === "metadata_unavailable" && (
        <Problem text={t("lookup.unavailable")}>
          <Button variant="secondary" onClick={() => lookup.mutate(isbn)}>
            {t("lookup.tryAgain")}
          </Button>
          {manual}
        </Problem>
      )}
      {lookup.error && !lookupCodes.includes(code ?? "") && (
        <UnexpectedError error={lookup.error} />
      )}
      {lookup.data && (
        <>
          <CandidateCard candidate={lookup.data} onNotRight={onNotRight} />
          {children(lookup.data)}
        </>
      )}
    </div>
  );
}

/** Search the catalogues by title or author and pick one of the results. */
export function TitleSearch({
  onNotRight,
  onManual,
  onFound,
  children,
}: LookupProps) {
  const { t } = useTranslation("books");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Candidate>();
  const search = useMutation({ mutationFn: searchCatalogues });
  const code = errorCode(search.error);
  const manual = (
    <Button variant="secondary" onClick={() => onManual()}>
      {t("lookup.enterManually")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setChosen(undefined);
          if (query.trim()) search.mutate(query.trim());
        }}
        className="flex items-end gap-2"
      >
        <div className="min-w-0 flex-1 [&_input]:w-full">
          <Field
            label={t("lookup.query")}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={search.isPending}>
          {t("lookup.search")}
        </Button>
      </form>
      {search.isPending && (
        <p role="status" className="text-ink-muted text-sm">
          {t("lookup.searching")}
        </p>
      )}
      {code === "metadata_unavailable" && (
        <Problem text={t("lookup.unavailable")}>
          <Button
            variant="secondary"
            onClick={() => search.mutate(query.trim())}
          >
            {t("lookup.tryAgain")}
          </Button>
          {manual}
        </Problem>
      )}
      {search.error && code !== "metadata_unavailable" && (
        <UnexpectedError error={search.error} />
      )}
      {search.data?.length === 0 && (
        <Problem text={t("lookup.noResults")}>{manual}</Problem>
      )}
      {chosen ? (
        <>
          <CandidateCard candidate={chosen} onNotRight={onNotRight} />
          {children(chosen)}
        </>
      ) : (
        search.data &&
        search.data.length > 0 && (
          <ul aria-label={t("lookup.results")} className="flex flex-col">
            {search.data.map((candidate, index) => (
              // A result list is replaced as a whole, never reordered, and
              // results without an ISBN have nothing else unique.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <li key={index}>
                <button
                  type="button"
                  onClick={() => {
                    setChosen(candidate);
                    onFound(candidate);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sidebar"
                >
                  <BookCover
                    id={candidate.isbn13 ?? candidate.title}
                    title={candidate.title}
                    authors={candidate.authors}
                    imageUrl={candidate.coverPreviewUrl}
                    size="spine"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-sm leading-5">
                      {candidate.title}
                    </span>
                    <span className="text-[13px] text-ink-muted leading-[18px]">
                      {[candidate.authors.join(", "), candidate.publishedYear]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

export function Problem({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="text-sm">
        {text}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function UnexpectedError({ error }: { error: Error }) {
  const errorMessage = useErrorMessage();
  return <FormError>{errorMessage(error)}</FormError>;
}

/** The book a lookup found, as the add board shows it. */
export function CandidateCard({
  candidate,
  imageUrl = candidate.coverPreviewUrl,
  onNotRight,
}: {
  candidate: Candidate;
  imageUrl?: string | null;
  onNotRight: (candidate: Candidate) => void;
}) {
  const { t, i18n } = useTranslation("books");
  const locale = i18n.resolvedLanguage;
  const language =
    candidate.language &&
    new Intl.DisplayNames(locale, { type: "language" }).of(candidate.language);
  const facts = [
    candidate.publishedYear,
    candidate.pageCount && t("page.pages", { count: candidate.pageCount }),
    language,
  ].filter(Boolean);
  const sources = new Intl.ListFormat(locale).format(
    candidate.sources.map((source) => t(`sources.${source}`)),
  );

  return (
    <div className="flex gap-4 rounded-xl border border-border bg-ground p-4">
      <BookCover
        id={candidate.isbn13 ?? candidate.title}
        title={candidate.title}
        authors={candidate.authors}
        imageUrl={imageUrl}
        size="small"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold font-serif text-lg leading-6">
          {candidate.title}
        </span>
        <span className="text-sm">{candidate.authors.join(", ")}</span>
        {facts.length > 0 && (
          <span className="text-[13px] text-ink-muted leading-[18px]">
            {facts.join(" · ")}
          </span>
        )}
        <span className="mt-auto pt-1 text-[13px] text-ink-muted leading-[18px]">
          {t("lookup.foundOn", { sources })} ·{" "}
          <button
            type="button"
            onClick={() => onNotRight(candidate)}
            className="cursor-pointer text-accent underline hover:text-accent-hover"
          >
            {t("lookup.notRight")}
          </button>
        </span>
      </div>
    </div>
  );
}
