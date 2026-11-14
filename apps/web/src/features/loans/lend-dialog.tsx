import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Field, FormError } from "../../components/ui/field";
import { SelectField } from "../../components/ui/select";
import { ApiError, api, unwrap } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { type BookDetail, bookQuery, type CopyDetail } from "../books/queries";
import { PersonPicker, useChosenName } from "../contacts/person-picker";
import type { ContactChoice } from "../contacts/queries";
import { formatPath } from "../locations/queries";
import { refreshLoans, today } from "./queries";

/** On the phone, dialogs of this feature slide up from the bottom as a sheet. */
export const sheet =
  "max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:px-5 max-md:pb-8";

function useCopyName() {
  const { t } = useTranslation("books");
  return (copy: CopyDetail) =>
    copy.format ? t(`copies.formats.${copy.format}`) : t("copies.copy");
}

function LendForm({ copyId, onDone }: { copyId: string; onDone: () => void }) {
  const { t } = useTranslation(["loans", "common"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [person, setPerson] = useState<ContactChoice | null>(null);
  const [startedOn, setStartedOn] = useState(today);
  const [note, setNote] = useState("");
  const name = useChosenName(person);

  const lend = useMutation({
    mutationFn: (contact: ContactChoice) =>
      unwrap(
        api.loans.lent.$post({
          json: { copyId, contact, startedOn, note },
        }),
      ),
    onSuccess: async () => {
      await refreshLoans(queryClient);
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (person && name) lend.mutate(person);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PersonPicker label={t("lend.to")} value={person} onChange={setPerson} />
      <Field
        label={t("lend.lentOn")}
        type="date"
        value={startedOn}
        onChange={(event) => setStartedOn(event.target.value)}
        required
      />
      <Field
        label={t("lend.note")}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
      />
      <FormError>
        {lend.error &&
          (lend.error instanceof ApiError && lend.error.code === "copy_lent"
            ? t("lend.copyLent")
            : errorMessage(lend.error))}
      </FormError>
      <div className="flex flex-col gap-1 md:flex-row">
        <Button
          type="submit"
          disabled={!name || lend.isPending}
          className="h-[50px] rounded-xl text-base md:h-10 md:rounded-lg md:text-sm"
        >
          {name ? t("lend.submitTo", { name }) : t("lend.submit")}
        </Button>
        <DialogClose asChild>
          <Button variant="ghost" className="h-11 text-accent md:hidden">
            {t("common:form.cancel")}
          </Button>
        </DialogClose>
      </div>
    </form>
  );
}

/** Lends one copy; opened from the copy's row on the book page. */
export function LendCopyDialog({
  book,
  copy,
  trigger,
}: {
  book: BookDetail;
  copy: CopyDetail;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["loans", "common"]);
  const copyName = useCopyName();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("lend.title")}
        closeLabel={t("common:form.cancel")}
        className={sheet}
      >
        <p className="-mt-4 text-ink-muted text-sm">
          {book.title} · {copyName(copy)}
        </p>
        {open && <LendForm copyId={copy.id} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Finds a book with a copy on the shelf, then lends that copy. */
export function LendBookDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useTranslation(["loans", "common"]);
  const [open, setOpen] = useState(false);
  const [bookId, setBookId] = useState<string>();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setBookId(undefined);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("pick.title")}
        closeLabel={t("common:form.cancel")}
        className={sheet}
      >
        {bookId ? (
          <ChosenBook
            bookId={bookId}
            onChange={() => setBookId(undefined)}
            onDone={() => setOpen(false)}
          />
        ) : (
          <BookSearch onChoose={setBookId} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BookSearch({ onChoose }: { onChoose: (bookId: string) => void }) {
  const { t } = useTranslation("loans");
  const [q, setQ] = useState("");
  const query = q.trim();
  const results = useQuery({
    queryKey: ["library", "lendable", query],
    queryFn: () =>
      unwrap(
        api.books.$get({
          query: { q: query, availability: "shelf", sort: "title", limit: "8" },
        }),
      ),
    enabled: query !== "",
  });
  const items = results.data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t("pick.search")}
        type="search"
        placeholder={t("pick.placeholder")}
        value={q}
        onChange={(event) => setQ(event.target.value)}
        autoComplete="off"
        autoFocus
      />
      {results.isSuccess && items.length === 0 && (
        <p className="text-ink-muted text-sm">{t("pick.noMatches")}</p>
      )}
      {query !== "" && items.length > 0 && (
        <ul className="flex flex-col rounded-xl border border-border">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-border border-t first:border-t-0"
            >
              <button
                type="button"
                onClick={() => onChoose(item.id)}
                className="flex w-full cursor-pointer flex-col px-3.5 py-2.5 text-left hover:bg-ground"
              >
                <span className="font-semibold text-sm">{item.title}</span>
                <span className="text-[13px] text-ink-muted leading-[18px]">
                  {item.authors.join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChosenBook({
  bookId,
  onChange,
  onDone,
}: {
  bookId: string;
  onChange: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("loans");
  const copyName = useCopyName();
  const { data: book } = useQuery(bookQuery(bookId));
  const available = book?.copies.filter((copy) => !copy.loan) ?? [];
  const [copyId, setCopyId] = useState<string>();
  const chosen = available.find((c) => c.id === copyId) ?? available[0];
  if (!book) return null;

  return (
    <>
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-x-3">
        <p className="font-semibold text-sm">{book.title}</p>
        <button
          type="button"
          onClick={onChange}
          className="h-9 cursor-pointer font-semibold text-accent text-sm hover:text-accent-hover"
        >
          {t("pick.change")}
        </button>
      </div>
      {available.length > 1 && (
        <SelectField
          label={t("lend.copy")}
          value={chosen?.id}
          onChange={(event) => setCopyId(event.target.value)}
        >
          {available.map((copy) => (
            <option key={copy.id} value={copy.id}>
              {copy.location
                ? `${copyName(copy)} · ${formatPath(copy.location.path)}`
                : copyName(copy)}
            </option>
          ))}
        </SelectField>
      )}
      {chosen && (
        <LendForm key={chosen.id} copyId={chosen.id} onDone={onDone} />
      )}
    </>
  );
}
