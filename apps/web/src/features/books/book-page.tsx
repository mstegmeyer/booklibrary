import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/shell/page-header";
import { Button } from "../../components/ui/button";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useFormat } from "../../lib/format";
import { useGenreName } from "../genres/queries";
import { useReturnToLibrary } from "../library/return-to-library";
import { formatPath } from "../locations/queries";
import { BookAside } from "./book-aside";
import { BookCover } from "./book-cover";
import {
  AddCopyDialog,
  MoveCopyDialog,
  RemoveCopyDialog,
} from "./copy-dialogs";
import { CopyLoanActions } from "./copy-loan-actions";
import { EbookSection } from "./ebook-section";
import { EditBookDialog } from "./edit-book-dialog";
import {
  type BookDetail,
  bookQuery,
  type Candidate,
  type CopyDetail,
  fromIsoDate,
  lookUpCover,
  refreshCatalogue,
} from "./queries";
import { UpdateFromCatalogueDialog } from "./update-dialog";

const rowButton =
  "h-11 rounded-[10px] px-3.5 text-[15px] md:h-9 md:rounded-lg md:text-sm";

export function BookPage() {
  const { t } = useTranslation("books");
  const { bookId } = useParams({ from: "/_app/books/$bookId" });
  const { data: book, error } = useQuery(bookQuery(bookId));
  const back = useReturnToLibrary();
  const [editing, setEditing] = useState(false);

  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState>
        <p>{t("page.notFound")}</p>
        <Link {...back} className="mt-2 inline-block font-semibold">
          {t("page.backToLibrary")}
        </Link>
      </EmptyState>
    );
  }
  if (!book) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-2 -mt-2 flex h-11 items-center justify-between md:hidden">
        <Link
          {...back}
          className="flex h-11 items-center gap-0.5 pr-3 font-medium text-base no-underline"
        >
          <ChevronLeft aria-hidden size={24} />
          {t("page.library")}
        </Link>
        <div className="flex items-center">
          {book.isbns.length > 0 && (
            <UpdateFromCatalogueDialog
              bookId={book.id}
              trigger={
                <button
                  type="button"
                  aria-label={t("update.action")}
                  className="flex size-11 cursor-pointer items-center justify-center text-accent"
                >
                  <RefreshCw aria-hidden size={20} />
                </button>
              }
            />
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-11 cursor-pointer px-2 font-medium text-accent text-base"
          >
            {t("page.edit")}
          </button>
        </div>
      </div>
      <nav
        aria-label={t("page.breadcrumb")}
        className="hidden items-center gap-1.5 text-[13px] text-ink-muted leading-[18px] md:flex"
      >
        <Link {...back} className="text-ink-muted no-underline">
          {t("page.library")}
        </Link>
        <ChevronRight aria-hidden size={14} />
        <span className="truncate text-ink">{book.title}</span>
      </nav>

      <div className="grid items-start gap-6 md:gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-x-10">
        <BookHeader book={book} onEdit={() => setEditing(true)} />
        <aside className="flex flex-col gap-4 empty:hidden max-xl:contents xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <BookAside book={book} />
        </aside>
        <div className="flex min-w-0 flex-col gap-8 xl:col-start-1">
          <Copies book={book} />
          <EbookSection book={book} titleClass={sectionTitle} />
          <Details book={book} />
        </div>
      </div>
      <EditBookDialog book={book} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

function BookHeader({
  book,
  onEdit,
}: {
  book: BookDetail;
  onEdit: () => void;
}) {
  const { t } = useTranslation("books");
  const format = useFormat();
  const facts = [
    book.publishedYear,
    book.pageCount && t("page.pages", { count: book.pageCount }),
    book.language && format.language(book.language),
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 gap-4 md:flex-wrap md:gap-7 xl:col-start-1">
      <div className="flex w-[108px] shrink-0 flex-col items-center gap-0.5 md:w-[180px]">
        <BookCover
          id={book.id}
          title={book.title}
          authors={book.authors}
          imageUrl={book.coverUrl}
          size="page"
        />
        {!book.coverUrl && book.isbns.length > 0 && (
          <CoverLookup bookId={book.id} />
        )}
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1 break-words pt-1 md:gap-2.5 md:pt-0">
        <h1 className="font-semibold font-serif text-2xl leading-[29px] md:text-[34px] md:leading-10">
          {book.title}
        </h1>
        {book.subtitle && (
          <p className="text-base text-ink-muted leading-6">{book.subtitle}</p>
        )}
        <p className="text-base leading-[22px] md:text-[17px] md:leading-6">
          {book.authors.join(", ")}
        </p>
        {facts.length > 0 && (
          <p className="text-ink-muted text-sm leading-5">
            {facts.join(" · ")}
          </p>
        )}
        {book.description && (
          <p className="mt-1.5 max-w-[520px] whitespace-pre-line text-[15px] leading-6">
            {book.description}
          </p>
        )}
        <div className="mt-2 hidden flex-wrap gap-2 md:flex">
          <Button
            variant="secondary"
            onClick={onEdit}
            className="h-[38px] whitespace-nowrap px-3.5"
          >
            {t("page.editDetails")}
          </Button>
          {book.isbns.length > 0 && (
            <UpdateFromCatalogueDialog
              bookId={book.id}
              trigger={
                <Button
                  variant="secondary"
                  className="h-[38px] whitespace-nowrap px-3.5"
                >
                  {t("update.action")}
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CoverLookup({ bookId }: { bookId: string }) {
  const { t } = useTranslation(["books", "common"]);
  const queryClient = useQueryClient();
  const lookUp = useMutation({
    mutationFn: () => lookUpCover(bookId),
    onSuccess: () => refreshCatalogue(queryClient),
  });
  const code = lookUp.error instanceof ApiError ? lookUp.error.code : null;
  return (
    <>
      <button
        type="button"
        onClick={() => lookUp.mutate()}
        disabled={lookUp.isPending}
        className="h-11 cursor-pointer whitespace-nowrap font-semibold text-accent text-sm hover:text-accent-hover disabled:cursor-default disabled:opacity-60 md:h-[34px] md:px-2"
      >
        {t("page.lookUpCover")}
      </button>
      {lookUp.error && (
        <p
          role="status"
          className="text-center text-[13px] text-ink-muted leading-[18px]"
        >
          {code === "cover_not_found"
            ? t("page.coverNotFound")
            : code === "metadata_unavailable"
              ? t("lookup.unavailable")
              : t("common:errors.generic")}
        </p>
      )}
    </>
  );
}

const sectionTitle =
  "font-semibold text-ink-muted text-xs uppercase leading-[18px] tracking-[0.06em] md:font-serif md:text-ink md:text-xl md:normal-case md:leading-[26px] md:tracking-normal";

function Copies({ book }: { book: BookDetail }) {
  const { t } = useTranslation("books");
  return (
    <section
      aria-labelledby="copies-title"
      className="flex flex-col gap-2 md:gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="copies-title" className={sectionTitle}>
          {t("copies.title")}
        </h2>
        <AddCopyDialog
          book={book}
          trigger={
            <button
              type="button"
              className="h-11 cursor-pointer px-2 font-semibold text-accent text-sm hover:text-accent-hover md:h-[34px]"
            >
              {t("copies.add")}
            </button>
          }
        />
      </div>
      {book.copies.length === 0 ? (
        <p className="rounded-xl border border-border border-dashed bg-surface px-4 py-6 text-center text-ink-muted text-sm">
          {t("copies.none")}
        </p>
      ) : (
        <ul className="rounded-xl border border-border bg-surface">
          {book.copies.map((copy) => (
            <CopyRow key={copy.id} book={book} copy={copy} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CopyRow({ book, copy }: { book: BookDetail; copy: CopyDetail }) {
  const { t } = useTranslation("books");
  const format = useFormat();
  const place = copy.location
    ? formatPath(copy.location.path)
    : t("copies.noLocation");
  const lent =
    copy.loan &&
    t("copies.lentTo", {
      name: copy.loan.contactName,
      date: format.date(fromIsoDate(copy.loan.startedOn)),
    });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-border border-t px-3.5 py-3 first:border-t-0 md:px-4 md:py-3.5">
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <span className="font-semibold text-[15px] leading-5 md:text-sm">
          {copy.format ? t(`copies.formats.${copy.format}`) : t("copies.copy")}
        </span>
        <span
          className={cn(
            "text-[13px] leading-[18px]",
            lent
              ? "font-medium text-lent md:font-normal md:text-ink-muted"
              : "text-ink-muted",
          )}
        >
          <span className={cn(lent && "hidden md:inline")}>{place}</span>
          {lent && <span className="md:hidden">{lent}</span>}
        </span>
      </div>
      <span
        className={cn(
          "hidden rounded-full px-2.5 py-0.5 font-medium text-xs leading-[18px] md:inline",
          lent ? "bg-lent-tint text-lent" : "bg-accent-tint-light text-accent",
        )}
      >
        {lent || t("copies.onShelf")}
      </span>
      <div className="flex gap-2">
        <CopyLoanActions book={book} copy={copy} />
        {!copy.loan && (
          <>
            <MoveCopyDialog
              book={book}
              copy={copy}
              trigger={
                <Button variant="secondary" className={rowButton}>
                  {t("copies.move")}
                </Button>
              }
            />
            <RemoveCopyDialog
              book={book}
              copy={copy}
              trigger={
                <Button variant="secondary" className={rowButton}>
                  {t("copies.remove")}
                </Button>
              }
            />
          </>
        )}
      </div>
    </li>
  );
}

function Details({ book }: { book: BookDetail }) {
  const { t, i18n } = useTranslation(["books", "genres"]);
  const format = useFormat();
  const genreName = useGenreName();
  return (
    <section aria-labelledby="details-title" className="flex flex-col gap-3">
      <h2 id="details-title" className={sectionTitle}>
        {t("details.title")}
      </h2>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm leading-5 md:grid-cols-[140px_minmax(0,1fr)]">
        <dt className="text-ink-muted">{t("genres:genre")}</dt>
        <dd>{book.genre ? genreName(book.genre) : t("genres:none")}</dd>
        <dt className="text-ink-muted">{t("details.isbn")}</dt>
        <dd className="tabular-nums">
          {book.isbns.length > 0 ? book.isbns.join(" · ") : t("details.none")}
        </dd>
        <dt className="text-ink-muted">{t("details.added")}</dt>
        <dd>
          {book.createdBy
            ? t("details.addedBy", {
                date: format.date(book.createdAt),
                name: book.createdBy.name,
              })
            : format.date(book.createdAt)}
        </dd>
        <dt className="text-ink-muted">{t("details.metadata")}</dt>
        <dd>
          {book.metadataSource
            ? new Intl.ListFormat(i18n.resolvedLanguage).format(
                book.metadataSource
                  .split(",")
                  .map((source) =>
                    t(`sources.${source as Candidate["sources"][number]}`),
                  ),
              )
            : t("details.manual")}
        </dd>
      </dl>
    </section>
  );
}
