import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/shell/page-header";
import { Button, buttonVariants } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { useFormat } from "../../lib/format";
import { BookCover } from "../books/book-cover";
import { fromIsoDate } from "../books/queries";
import { PeopleCard } from "../contacts/people-card";
import { LendBookDialog } from "./lend-dialog";
import { LoanMenu, ReturnDialog } from "./loan-dialogs";
import {
  daysBetween,
  type Loan,
  type LoanList,
  loansQuery,
  today,
} from "./queries";

const useLoans = (list: LoanList) => useInfiniteQuery(loansQuery(list));
type LoansResult = ReturnType<typeof useLoans>;

const loansOf = (query: LoansResult) =>
  query.data?.pages.flatMap((page) => page.items) ?? [];
const totalOf = (query: LoansResult) => query.data?.pages[0]?.total ?? 0;

/** Opens the add dialog of the Library for a book someone lent us. */
const addBorrowed = {
  to: "/library",
  search: { add: true, own: "borrowed" },
} as const;

export function LoansPage() {
  const { t } = useTranslation("loans");
  const lent = useLoans("lent");
  const borrowed = useLoans("borrowed");
  const returned = useLoans("returned");
  const [showReturned, setShowReturned] = useState(false);

  const summary =
    lent.isSuccess && borrowed.isSuccess
      ? [
          t("summary.lent", { count: totalOf(lent) }),
          t("summary.borrowed", { count: totalOf(borrowed) }),
        ].join(" · ")
      : undefined;

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={summary}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              {...addBorrowed}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "hidden md:inline-flex",
              )}
            >
              {t("addBorrowed")}
            </Link>
            <LendBookDialog
              trigger={
                <Button
                  aria-label={t("lendBook")}
                  className="max-md:size-11 max-md:justify-end max-md:bg-transparent max-md:p-0 max-md:text-accent max-md:hover:bg-transparent"
                >
                  <Plus aria-hidden size={26} className="md:hidden" />
                  <span className="hidden md:inline">{t("lendBook")}</span>
                </Button>
              }
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-start gap-3 md:gap-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 md:gap-8">
          <Section list="lent" title={t("sections.lent")} query={lent} />
          <Section
            list="borrowed"
            title={t("sections.borrowed")}
            query={borrowed}
            action={
              <Link
                {...addBorrowed}
                className="flex h-11 items-center pl-4 font-semibold text-sm md:hidden"
              >
                {t("add")}
              </Link>
            }
          >
            <p className="hidden text-[13px] text-ink-muted leading-5 md:block">
              {t("borrowedNote")}
            </p>
          </Section>
          <button
            type="button"
            aria-expanded={showReturned}
            onClick={() => setShowReturned(!showReturned)}
            className="flex h-12 cursor-pointer items-center justify-between rounded-xl border border-border bg-surface px-3.5 font-medium text-[15px] md:hidden"
          >
            {t("showReturned")}
            <ChevronRight
              aria-hidden
              size={18}
              className={cn(
                "text-ink-muted transition-transform",
                showReturned && "rotate-90",
              )}
            />
          </button>
          <Section
            list="returned"
            title={t("sections.returned")}
            query={returned}
            className={cn(!showReturned && "max-md:hidden")}
          />
        </div>
        <PeopleCard />
      </div>
    </>
  );
}

function Section({
  list,
  title,
  query,
  action,
  className,
  children,
}: {
  list: LoanList;
  title: string;
  query: LoansResult;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation("loans");
  const loans = loansOf(query);
  const headingId = `loans-${list}`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-2 md:gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className="font-semibold text-ink-muted text-xs uppercase leading-[18px] tracking-[0.06em] md:font-serif md:text-ink md:text-xl md:normal-case md:leading-[26px] md:tracking-normal"
        >
          {title}
          {list !== "returned" && query.isSuccess && (
            <span className="md:hidden"> · {totalOf(query)}</span>
          )}
        </h2>
        {action}
      </div>
      {query.isSuccess && loans.length === 0 ? (
        <p className="rounded-xl border border-border border-dashed bg-surface px-4 py-5 text-center text-ink-muted text-sm">
          {t(`empty.${list}`)}
        </p>
      ) : (
        <>
          <LoanTable list={list} loans={loans} />
          <LoanCards list={list} loans={loans} />
        </>
      )}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          className="self-center"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t("loadMore")}
        </Button>
      )}
      {children}
    </section>
  );
}

function useLoanText() {
  const { t } = useTranslation(["loans", "books"]);
  const format = useFormat();
  const date = (day: string) => format.date(fromIsoDate(day));
  return {
    date,
    since: (loan: Loan) =>
      t("days", { count: daysBetween(loan.startedOn, today()) }),
    period: (loan: Loan) =>
      t("period", {
        start: date(loan.startedOn),
        end: date(loan.endedOn ?? ""),
      }),
    days: (loan: Loan) => daysBetween(loan.startedOn, loan.endedOn ?? today()),
    who: (loan: Loan) =>
      loan.direction === "lent"
        ? t("lentToName", { name: loan.contact.name })
        : t("borrowedFromName", { name: loan.contact.name }),
    byline: (loan: Loan) =>
      [
        loan.book.authors.join(", "),
        loan.copy?.format && t(`books:copies.formats.${loan.copy.format}`),
      ]
        .filter(Boolean)
        .join(" · "),
    place: (loan: Loan) =>
      loan.copy?.locationPath.length
        ? loan.copy.locationPath.join(" · ")
        : t("noLocation"),
  };
}

function Cover({ loan, className }: { loan: Loan; className: string }) {
  return (
    <BookCover
      id={loan.book.id}
      title={loan.book.title}
      authors={loan.book.authors}
      imageUrl={loan.book.thumbnailUrl}
      size="spine"
      className={className}
    />
  );
}

function BookTitle({ loan, className }: { loan: Loan; className?: string }) {
  return (
    <Link
      to="/books/$bookId"
      params={{ bookId: loan.book.id }}
      className={cn(
        "font-semibold text-ink no-underline hover:underline",
        className,
      )}
    >
      {loan.book.title}
    </Link>
  );
}

function MarkReturned({ loan, className }: { loan: Loan; className: string }) {
  const { t } = useTranslation("loans");
  return (
    <ReturnDialog
      loanId={async () => loan.id}
      startedOn={loan.startedOn}
      trigger={
        <Button
          variant="secondary"
          aria-label={t("markReturned")}
          className={cn("whitespace-nowrap", className)}
        >
          <span className="md:hidden">{t("returnedShort")}</span>
          <span className="hidden md:inline">{t("markReturned")}</span>
        </Button>
      }
    />
  );
}

const th =
  "px-4 py-2.5 text-left font-semibold text-ink-muted text-xs leading-[18px]";
const td = "px-4 py-2.5";

function LoanTable({ list, loans }: { list: LoanList; loans: Loan[] }) {
  const { t } = useTranslation("loans");
  const text = useLoanText();
  if (loans.length === 0) return null;

  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
      <table
        className={cn(
          "w-full border-collapse text-sm leading-5",
          list === "lent" ? "min-w-[680px]" : "min-w-[560px]",
        )}
      >
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t("columns.book")}
            </th>
            <th scope="col" className={th}>
              {list === "lent"
                ? t("columns.lentTo")
                : list === "borrowed"
                  ? t("columns.borrowedFrom")
                  : t("columns.loan")}
            </th>
            <th scope="col" className={th}>
              {list === "returned" ? t("columns.period") : t("columns.since")}
            </th>
            {list === "lent" && (
              <th scope="col" className={th}>
                {t("columns.goesBackTo")}
              </th>
            )}
            {list === "returned" && (
              <th scope="col" className={cn(th, "text-right")}>
                {t("columns.days")}
              </th>
            )}
            <th scope="col" className={th}>
              <span className="sr-only">{t("columns.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id} className="border-border border-t">
              <td className={td}>
                <div className="flex items-center gap-3">
                  {list !== "returned" && (
                    <Cover loan={loan} className="h-12 w-8" />
                  )}
                  <div className="min-w-0">
                    <BookTitle loan={loan} />
                    <div className="text-[13px] text-ink-muted leading-[18px]">
                      {text.byline(loan)}
                    </div>
                  </div>
                </div>
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {list === "returned" ? text.who(loan) : loan.contact.name}
              </td>
              <td className={cn(td, "whitespace-nowrap")}>
                {list === "returned" ? (
                  text.period(loan)
                ) : (
                  <>
                    <div>{text.date(loan.startedOn)}</div>
                    <div className="text-[13px] text-ink-muted leading-[18px]">
                      {text.since(loan)}
                    </div>
                  </>
                )}
              </td>
              {list === "lent" && <td className={td}>{text.place(loan)}</td>}
              {list === "returned" && (
                <td className={cn(td, "text-right tabular-nums")}>
                  {text.days(loan)}
                </td>
              )}
              <td className={td}>
                <div className="flex items-center justify-end gap-1">
                  {list !== "returned" && (
                    <MarkReturned loan={loan} className="h-9 px-3.5" />
                  )}
                  <LoanMenu loan={loan} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoanCards({ list, loans }: { list: LoanList; loans: Loan[] }) {
  const { t } = useTranslation("loans");
  const text = useLoanText();
  if (loans.length === 0) return null;

  const note = (loan: Loan) =>
    list === "lent"
      ? `${loan.contact.name} · ${text.since(loan)}`
      : list === "borrowed"
        ? `${t("fromName", { name: loan.contact.name })} · ${text.since(loan)}`
        : `${text.who(loan)} · ${text.period(loan)}`;

  return (
    <ul className="rounded-xl border border-border bg-surface md:hidden">
      {loans.map((loan) => (
        <li
          key={loan.id}
          className="flex items-center gap-3 border-border border-t py-2.5 pr-1.5 pl-3.5 first:border-t-0"
        >
          <Cover loan={loan} className="h-[54px] w-9" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <BookTitle loan={loan} className="truncate text-[15px] leading-5" />
            <span className="truncate text-[13px] text-ink-muted leading-[18px]">
              {note(loan)}
            </span>
          </div>
          {list !== "returned" && (
            <MarkReturned loan={loan} className="h-11 rounded-[10px] px-3" />
          )}
          <LoanMenu loan={loan} />
        </li>
      ))}
    </ul>
  );
}
