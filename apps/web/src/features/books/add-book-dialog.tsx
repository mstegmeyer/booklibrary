import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Tabs } from "radix-ui";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { useFormat } from "../../lib/format";
import { useErrorMessage } from "../../lib/use-error-message";
import { useChosenName } from "../contacts/person-picker";
import { formatPath, locationsQuery } from "../locations/queries";
import { IsbnLookup, TitleSearch } from "./add-book-lookup";
import { BookCover } from "./book-cover";
import {
  BookForm,
  type BookFormValues,
  useBookErrorMessage,
} from "./book-form";
import {
  type Ownership,
  OwnershipFieldset,
  type OwnershipKind,
  ownershipJson,
} from "./ownership";
import {
  bookQuery,
  type Candidate,
  fromIsoDate,
  refreshCatalogue,
  uploadCover,
} from "./queries";

const lastLocationKey = "books.lastLocation";
type Tab = "isbn" | "search" | "manual";
type Intent = "add" | "next";

/** The book as it is sent; `coverUrl` and `sources` come from a lookup. */
type BookPayload = Omit<BookFormValues, "sortAs"> & {
  coverUrl?: string;
  sources?: Candidate["sources"];
};

type Save = {
  payload: BookPayload;
  cover: File | null;
  intent: Intent;
  /** The answer to the "Same book?" question. */
  answer?: { attachTo: string } | { keepSeparate: true };
};

/** The server asks first: the book is in the library, or the same book exists. */
type Question = {
  code: "isbn_taken" | "same_book";
  bookId: string;
  save: Save;
};

const isQuestion = (error: Error | null) =>
  error instanceof ApiError &&
  (error.code === "isbn_taken" || error.code === "same_book");

const fromCandidate = (candidate: Candidate): BookPayload => ({
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

const intentOf = (value: string | undefined): Intent =>
  value === "next" ? "next" : "add";

/** "Add a book": by ISBN, by a title search or by hand. */
export function AddBookDialog({
  open,
  onOpenChange,
  own,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects how the book is owned; "In our library" otherwise. */
  own?: Exclude<OwnershipKind, "library">;
}) {
  const { t } = useTranslation(["books", "common"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("add.title")}
        closeLabel={t("common:form.cancel")}
        className="max-w-[640px] max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:px-4"
      >
        <AddBook own={own} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddBook({ own, onDone }: { own?: OwnershipKind; onDone: () => void }) {
  const { t } = useTranslation("books");
  const queryClient = useQueryClient();
  const bookErrorMessage = useBookErrorMessage();
  const { data: locations } = useQuery(locationsQuery);
  const [tab, setTab] = useState<Tab>("isbn");
  const [isbnKey, setIsbnKey] = useState(0);
  const [manual, setManual] = useState<{
    key: number;
    values: Partial<BookPayload>;
  }>({ key: 0, values: {} });
  const [ownership, setOwnership] = useState<Ownership>(() => ({
    kind: own ?? "library",
    locationId: localStorage.getItem(lastLocationKey) ?? "",
    person: null,
  }));
  const [personMissing, setPersonMissing] = useState(false);
  const [question, setQuestion] = useState<Question>();
  const [added, setAdded] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const personName = useChosenName(ownership.person);
  // A remembered location may have been deleted since.
  const current = {
    ...ownership,
    locationId: locations?.some((l) => l.id === ownership.locationId)
      ? ownership.locationId
      : "",
  };

  const finish = async (message: string, tell: boolean, intent: Intent) => {
    localStorage.setItem(lastLocationKey, current.locationId);
    await Promise.all([
      refreshCatalogue(queryClient),
      ...["reading", "loans", "contacts", "statistics"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    ]);
    setQuestion(undefined);
    if (intent === "add") return tell ? setNotice(message) : onDone();
    setAdded(message);
    startNext();
  };

  const startNext = () => {
    setQuestion(undefined);
    setTab("isbn");
    setIsbnKey((key) => key + 1);
  };

  const save = useMutation({
    mutationFn: async ({ payload, cover, answer }: Save) => {
      const book = await unwrap(
        api.books.$post({
          json: { ...payload, ...ownershipJson(current), ...answer },
        }),
      );
      if (cover && book.outcome === "created") {
        await uploadCover(book.id, cover);
      }
      return book;
    },
    onSuccess: (book, { intent }) => {
      const known = book.outcome === "known" || book.statusKept;
      const message = book.statusKept
        ? t("add.statusKept", { title: book.title })
        : book.outcome === "known"
          ? t(`add.known.${current.kind}`, { title: book.title })
          : t("add.added", { title: book.title });
      return finish(message, known, intent);
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

  const submit = (payload: BookPayload, cover: File | null, intent: Intent) => {
    if (current.kind === "borrowed" && !personName) {
      setPersonMissing(true);
      return;
    }
    setAdded(undefined);
    save.mutate({ payload, cover, intent });
  };

  const footer = (
    <>
      <OwnershipFieldset
        value={current}
        onChange={(value) => {
          setOwnership(value);
          setPersonMissing(false);
        }}
      />
      {personMissing && <FormError>{t("add.choosePerson")}</FormError>}
      <FormError>
        {save.error && !isQuestion(save.error)
          ? bookErrorMessage(save.error)
          : undefined}
      </FormError>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          value="add"
          variant="secondary"
          disabled={save.isPending}
        >
          {t("add.submit")}
        </Button>
        <Button type="submit" value="next" disabled={save.isPending}>
          {t("add.submitNext")}
        </Button>
      </div>
    </>
  );

  const addFound = (candidate: Candidate) => (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        submit(
          fromCandidate(candidate),
          null,
          intentOf(submitter?.getAttribute("value") ?? undefined),
        );
      }}
      className="flex flex-col gap-5"
    >
      {footer}
    </form>
  );

  const openManual = (values: Partial<BookPayload>) => {
    setManual((m) => ({ key: m.key + 1, values }));
    setTab("manual");
  };
  const lookupProps = {
    onNotRight: (candidate: Candidate) => openManual(fromCandidate(candidate)),
    onManual: (isbn?: string) => openManual(isbn ? { isbns: [isbn] } : {}),
    children: addFound,
  };

  if (notice) {
    return (
      <div className="flex flex-col gap-5">
        <p role="status" className="text-sm">
          {notice}
        </p>
        <div className="flex justify-end">
          <Button onClick={onDone}>{t("add.close")}</Button>
        </div>
      </div>
    );
  }

  if (question?.code === "isbn_taken") {
    return (
      <AlreadyInLibrary
        bookId={question.bookId}
        locationId={current.locationId}
        onAdded={(title) =>
          finish(t("add.added", { title }), false, question.save.intent)
        }
        onSkip={() => (question.save.intent === "add" ? onDone() : startNext())}
      />
    );
  }

  if (question?.code === "same_book") {
    const answer = (answer: Save["answer"]) =>
      save.mutate({ ...question.save, answer });
    return (
      <KnownBook bookId={question.bookId} title={t("same.title")}>
        <p className="text-sm">{t("same.text")}</p>
        <FormError>
          {save.error && !isQuestion(save.error)
            ? bookErrorMessage(save.error)
            : undefined}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() => answer({ keepSeparate: true })}
          >
            {t("same.separate")}
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => answer({ attachTo: question.bookId })}
          >
            {t("same.attach")}
          </Button>
        </div>
      </KnownBook>
    );
  }

  const tabClass =
    "h-10 cursor-pointer font-medium text-ink-muted text-sm data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-[inset_0_-2px_0_var(--color-accent)]";
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="flex flex-col gap-5"
    >
      <Tabs.List className="flex gap-6 overflow-x-auto border-border border-b">
        <Tabs.Trigger value="isbn" className={tabClass}>
          {t("add.tabs.isbn")}
        </Tabs.Trigger>
        <Tabs.Trigger value="search" className={tabClass}>
          {t("add.tabs.search")}
        </Tabs.Trigger>
        <Tabs.Trigger value="manual" className={tabClass}>
          {t("add.tabs.manual")}
        </Tabs.Trigger>
      </Tabs.List>
      {added && (
        <p role="status" className="text-accent text-sm">
          {added}
        </p>
      )}
      <Tabs.Content value="isbn">
        <IsbnLookup key={isbnKey} {...lookupProps} />
      </Tabs.Content>
      <Tabs.Content value="search">
        <TitleSearch {...lookupProps} />
      </Tabs.Content>
      <Tabs.Content value="manual">
        <BookForm
          key={manual.key}
          id="add-book"
          initialValues={manual.values}
          coverUrl={manual.values.coverUrl}
          onSubmit={({ sortAs: _, ...values }, cover, intent) =>
            submit(
              {
                ...values,
                // A chosen image replaces the one the lookup found.
                coverUrl: cover ? undefined : manual.values.coverUrl,
                sources: manual.values.sources,
              },
              cover,
              intentOf(intent),
            )
          }
        >
          {footer}
        </BookForm>
      </Tabs.Content>
    </Tabs.Root>
  );
}

/** A book the system already has, with where its copies are. */
function KnownBook({
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
