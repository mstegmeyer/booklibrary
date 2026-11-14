import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { useFormat } from "../../lib/format";
import { useErrorMessage } from "../../lib/use-error-message";
import { useChosenName } from "../contacts/person-picker";
import { formatPath, locationsQuery } from "../locations/queries";
import type { Staged } from "./add-book-upload";
import { BookCover } from "./book-cover";
import { type BookFormValues, useBookErrorMessage } from "./book-form";
import { type Ownership, type OwnershipKind, ownershipJson } from "./ownership";
import {
  bookQuery,
  type Candidate,
  fromIsoDate,
  refreshCatalogue,
  uploadCover,
} from "./queries";

// Adding a book, shared by the Add dialog and the scan screen.

const lastLocationKey = "books.lastLocation";

/** The book as it is sent; `coverUrl` and `sources` come from a lookup. */
export type BookPayload = Omit<BookFormValues, "sortAs"> & {
  coverUrl?: string;
  sources?: Candidate["sources"];
};

/** The answers to "Same book?" and to replacing the book's file. */
type Answer = { attachTo?: string; keepSeparate?: true; replace?: true };

type Save = { payload: BookPayload; cover: File | null; answer?: Answer };

/**
 * The server asks first: the book is in the library, the same book exists,
 * or it has a file of this format already.
 */
type Question = {
  code: "isbn_taken" | "same_book" | "format_exists";
  bookId: string;
  save: Save;
};

const isQuestion = (error: Error | null) =>
  error instanceof ApiError &&
  (error.code === "isbn_taken" ||
    error.code === "same_book" ||
    error.code === "format_exists");

export const fromCandidate = (candidate: Candidate): BookPayload => ({
  title: candidate.title,
  subtitle: candidate.subtitle,
  authors: candidate.authors,
  description: candidate.description,
  pageCount: candidate.pageCount,
  publishedYear: candidate.publishedYear,
  language: candidate.language,
  isbns: candidate.isbn13 ? [candidate.isbn13] : [],
  coverUrl: candidate.coverUrl ?? undefined,
  sources: candidate.sources,
});

export type AddBookFlow = ReturnType<typeof useAddBook>;

/**
 * The ownership (with the remembered shelf), saving, and the questions the
 * server asks before a book is added.
 */
export function useAddBook({
  own,
  ebook,
  onAdded,
}: {
  /** Preselects how the book is owned; "In our library" otherwise. */
  own?: OwnershipKind;
  /** An e-book file the book is added with, instead of an ownership. */
  ebook?: Staged;
  /** `known` when the book was in the system already. */
  onAdded: (message: string, known: boolean) => void;
}) {
  const { t } = useTranslation("books");
  const queryClient = useQueryClient();
  const { data: locations } = useQuery(locationsQuery);
  const [ownership, setOwnership] = useState<Ownership>(() => ({
    kind: own ?? "library",
    locationId: localStorage.getItem(lastLocationKey) ?? "",
    person: null,
  }));
  const [personMissing, setPersonMissing] = useState(false);
  const [question, setQuestion] = useState<Question>();
  const personName = useChosenName(ownership.person);
  // A remembered location may have been deleted since.
  const current = {
    ...ownership,
    locationId: locations?.some((l) => l.id === ownership.locationId)
      ? ownership.locationId
      : "",
  };

  const finish = async (message: string, known: boolean) => {
    localStorage.setItem(lastLocationKey, current.locationId);
    await Promise.all([
      refreshCatalogue(queryClient),
      ...["reading", "loans", "contacts", "statistics"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    ]);
    setQuestion(undefined);
    onAdded(message, known);
  };

  const save = useMutation({
    mutationFn: async ({ payload, cover, answer }: Save) => {
      const book = await unwrap(
        api.books.$post({
          json: {
            ...payload,
            ...(ebook ? { upload: ebook.id } : ownershipJson(current)),
            ...answer,
          },
        }),
      );
      if (cover && book.outcome === "created") {
        await uploadCover(book.id, cover);
      }
      return book;
    },
    onSuccess: (book) => {
      const known = book.outcome === "known" || book.statusKept;
      const message = book.statusKept
        ? t("add.statusKept", { title: book.title })
        : book.outcome === "known"
          ? t(`add.known.${ebook ? "ebook" : current.kind}`, {
              title: book.title,
            })
          : t("add.added", { title: book.title });
      return finish(message, known);
    },
    onError: (error, variables) => {
      if (error instanceof ApiError && isQuestion(error)) {
        setQuestion({
          code: error.code as Question["code"],
          bookId: String(error.details.bookId),
          save: variables,
        });
      }
    },
  });

  return {
    ownership: current,
    setOwnership: (value: Ownership) => {
      setOwnership(value);
      setPersonMissing(false);
    },
    personMissing,
    submit: (payload: BookPayload, cover: File | null) => {
      if (!ebook && current.kind === "borrowed" && !personName) {
        setPersonMissing(true);
        return;
      }
      save.mutate({ payload, cover });
    },
    question,
    answer: (answer: Answer) => {
      if (question) {
        save.mutate({
          ...question.save,
          answer: { ...question.save.answer, ...answer },
        });
      }
    },
    addedCopy: (title: string) => finish(t("add.added", { title }), false),
    skip: () => setQuestion(undefined),
    isPending: save.isPending,
    /** A failure that is not one of the questions. */
    error: save.error && !isQuestion(save.error) ? save.error : null,
  };
}

/** "Already in your library?" and "Same book?", once the server asks. */
export function AddQuestion({
  flow,
  onSkip,
}: {
  flow: AddBookFlow;
  onSkip: () => void;
}) {
  const { t } = useTranslation("books");
  const bookErrorMessage = useBookErrorMessage();
  const { question } = flow;
  if (question?.code === "isbn_taken") {
    return (
      <AlreadyInLibrary
        bookId={question.bookId}
        locationId={flow.ownership.locationId}
        onAdded={flow.addedCopy}
        onSkip={() => {
          flow.skip();
          onSkip();
        }}
      />
    );
  }
  if (question?.code !== "same_book") return null;
  return (
    <KnownBook bookId={question.bookId} title={t("same.title")}>
      <p className="text-sm">{t("same.text")}</p>
      <FormError>
        {flow.error ? bookErrorMessage(flow.error) : undefined}
      </FormError>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          disabled={flow.isPending}
          onClick={() => flow.answer({ keepSeparate: true })}
        >
          {t("same.separate")}
        </Button>
        <Button
          disabled={flow.isPending}
          onClick={() => flow.answer({ attachTo: question.bookId })}
        >
          {t("same.attach")}
        </Button>
      </div>
    </KnownBook>
  );
}

/** A book the system already has, with where its copies are. */
export function KnownBook({
  bookId,
  title,
  children,
}: {
  bookId: string;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("books");
  const format = useFormat();
  const { data: book } = useQuery(bookQuery(bookId));
  if (!book) return null;

  return (
    <section aria-labelledby="known-title" className="flex flex-col gap-4">
      <h3 id="known-title" className="font-semibold text-base">
        {title}
      </h3>
      <div className="flex gap-4 rounded-xl border border-border bg-ground p-4">
        <BookCover
          id={book.id}
          title={book.title}
          authors={book.authors}
          imageUrl={book.thumbnailUrl}
          size="small"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold font-serif text-lg leading-6">
            {book.title}
          </span>
          <span className="text-sm">{book.authors.join(", ")}</span>
          {book.copies.length === 0 ? (
            <span className="text-[13px] text-ink-muted">
              {t("duplicate.noCopies")}
            </span>
          ) : (
            <ul className="mt-1 text-[13px] text-ink-muted leading-[18px]">
              {book.copies.map((copy) => (
                <li key={copy.id}>
                  {copy.loan
                    ? t("copies.lentTo", {
                        name: copy.loan.contactName,
                        date: format.date(fromIsoDate(copy.loan.startedOn)),
                      })
                    : copy.location
                      ? formatPath(copy.location.path)
                      : t("copies.noLocation")}
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/books/$bookId"
            params={{ bookId: book.id }}
            className="mt-auto pt-1 text-[13px]"
          >
            {t("duplicate.open")}
          </Link>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Shown when the ISBN belongs to a book the household already has. */
function AlreadyInLibrary({
  bookId,
  locationId,
  onAdded,
  onSkip,
}: {
  bookId: string;
  locationId: string;
  onAdded: (title: string) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation("books");
  const errorMessage = useErrorMessage();
  const addCopy = useMutation({
    mutationFn: () =>
      unwrap(
        api.books[":id"].copies.$post({
          param: { id: bookId },
          json: { locationId: locationId || null },
        }),
      ),
    onSuccess: (updated) => onAdded(updated.title),
  });

  return (
    <KnownBook bookId={bookId} title={t("duplicate.title")}>
      <FormError>
        {addCopy.error ? errorMessage(addCopy.error) : undefined}
      </FormError>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onSkip}>
          {t("duplicate.skip")}
        </Button>
        <Button disabled={addCopy.isPending} onClick={() => addCopy.mutate()}>
          {t("duplicate.addCopy")}
        </Button>
      </div>
    </KnownBook>
  );
}
