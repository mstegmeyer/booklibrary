import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { useFormat } from "../../lib/format";
import { useErrorMessage } from "../../lib/use-error-message";
import { LocationSelect } from "../locations/location-select";
import { formatPath, locationsQuery } from "../locations/queries";
import { BookCover } from "./book-cover";
import {
  BookForm,
  type BookFormValues,
  useBookErrorMessage,
} from "./book-form";
import {
  bookQuery,
  fromIsoDate,
  refreshCatalogue,
  uploadCover,
} from "./queries";

const lastLocationKey = "books.lastLocation";
type Intent = "add" | "next";

/** "Add a book": manual entry for now, with the book's first copy. */
export function AddBookDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["books", "common"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("add.title")}
        closeLabel={t("common:form.cancel")}
        className="max-w-[640px]"
      >
        <AddBook onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddBook({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("books");
  const queryClient = useQueryClient();
  const bookErrorMessage = useBookErrorMessage();
  const { data: locations } = useQuery(locationsQuery);
  const [formKey, setFormKey] = useState(0);
  const [added, setAdded] = useState<string>();
  const [duplicateOf, setDuplicateOf] = useState<string>();
  const [intent, setIntent] = useState<Intent>("add");
  const [locationId, setLocationId] = useState(
    () => localStorage.getItem(lastLocationKey) ?? "",
  );
  // A remembered location may have been deleted since.
  const location = locations?.some((l) => l.id === locationId)
    ? locationId
    : "";

  const finish = async (title: string) => {
    localStorage.setItem(lastLocationKey, location);
    await refreshCatalogue(queryClient);
    setDuplicateOf(undefined);
    if (intent === "add") return onDone();
    setAdded(title);
    setFormKey((key) => key + 1);
  };

  const create = useMutation({
    mutationFn: async (input: {
      values: BookFormValues;
      cover: File | null;
    }) => {
      const book = await unwrap(
        api.books.$post({
          json: { ...input.values, copy: { locationId: location || null } },
        }),
      );
      if (input.cover) await uploadCover(book.id, input.cover);
      return book;
    },
    onSuccess: (book) => finish(book.title),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "isbn_taken") {
        setDuplicateOf(String(error.details.bookId));
      }
    },
  });

  if (duplicateOf) {
    return (
      <Duplicate
        bookId={duplicateOf}
        locationId={location}
        onAdded={finish}
        onSkip={() => {
          setDuplicateOf(undefined);
          create.reset();
          if (intent === "add") onDone();
          else setFormKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <BookForm
      key={formKey}
      id="add-book"
      onSubmit={(values, cover, submitIntent) => {
        setIntent(submitIntent === "next" ? "next" : "add");
        setAdded(undefined);
        create.mutate({ values, cover });
      }}
    >
      <fieldset className="min-w-0">
        <legend className="mb-2 font-semibold text-[13px] leading-[18px]">
          {t("add.thisBookIs")}
        </legend>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex shrink-0 items-center gap-2.5 text-sm sm:w-[180px]">
            <input
              type="radio"
              name="ownership"
              defaultChecked
              className="size-[18px] accent-accent"
            />
            {t("add.inLibrary")}
          </label>
          <LocationSelect
            aria-label={t("add.shelf")}
            noneLabel={t("add.noLocation")}
            value={location}
            onChange={(event) => setLocationId(event.target.value)}
            className="w-full flex-1 sm:w-auto"
          />
        </div>
      </fieldset>
      {added && (
        <p role="status" className="text-accent text-sm">
          {t("add.added", { title: added })}
        </p>
      )}
      <FormError>
        {create.error &&
        !(
          create.error instanceof ApiError && create.error.code === "isbn_taken"
        )
          ? bookErrorMessage(create.error)
          : undefined}
      </FormError>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          value="add"
          variant="secondary"
          disabled={create.isPending}
        >
          {t("add.submit")}
        </Button>
        <Button type="submit" value="next" disabled={create.isPending}>
          {t("add.submitNext")}
        </Button>
      </div>
    </BookForm>
  );
}

/** Shown when the ISBN belongs to a book the household already has. */
function Duplicate({
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
  const format = useFormat();
  const { data: book } = useQuery(bookQuery(bookId));
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
  if (!book) return null;

  return (
    <section aria-labelledby="duplicate-title" className="flex flex-col gap-4">
      <h3 id="duplicate-title" className="font-semibold text-base">
        {t("duplicate.title")}
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
    </section>
  );
}
