import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { api, unwrap } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useFormat } from "../../lib/format";
import { useErrorMessage } from "../../lib/use-error-message";
import { coverColor } from "../books/book-cover";
import { type BookDetail, fromIsoDate } from "../books/queries";
import { DateDialog } from "./date-dialog";
import { ProgressBar } from "./progress-bar";
import { ProgressDialog } from "./progress-dialog";
import {
  type CurrentReading,
  householdQuery,
  type MyReading,
  myReadingQuery,
  percent,
  refreshReading,
  todayIso,
  useMonthYear,
} from "./queries";

const statuses = ["want", "reading", "read", "abandoned"] as const;
type Status = (typeof statuses)[number];

const cardTitle =
  "font-semibold text-ink-muted text-xs uppercase leading-[18px] tracking-[0.06em] md:leading-4";

/** The "Your reading" card of the book page. */
export function YourReading({ book }: { book: BookDetail }) {
  const { t } = useTranslation("reading");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery(myReadingQuery(book.id));
  const current = data?.current ?? null;
  const param = { bookId: book.id };

  const change = useMutation({
    mutationFn: async (status: Status | null) => {
      if (status === null) {
        const { bookKept } = await unwrap(
          api.reading.books[":bookId"].$delete({ param }),
        );
        if (!bookKept) await navigate({ to: "/reading", replace: true });
        return;
      }
      await unwrap(
        status === "read"
          ? api.reading.books[":bookId"].finish.$post({
              param,
              json: { date: todayIso() },
            })
          : api.reading.books[":bookId"].$put({
              param,
              json: { status, date: todayIso() },
            }),
      );
    },
    onSuccess: () => refreshReading(queryClient),
  });

  if (!data) return null;
  const choose = (status: Status) => {
    if (status !== current?.status) change.mutate(status);
  };

  return (
    <section
      aria-labelledby="your-reading-title"
      className="flex flex-col gap-2 md:gap-4 md:rounded-xl md:border md:border-border md:bg-surface md:p-5"
    >
      <div className="flex min-h-11 items-center justify-between gap-3 md:min-h-7">
        <h2 id="your-reading-title" className={cardTitle}>
          {t("book.title")}
        </h2>
        {current && (
          <ClearStatus
            current={current}
            disabled={change.isPending}
            onClear={() => change.mutate(null)}
          />
        )}
      </div>
      <fieldset
        aria-label={t("book.status")}
        className="grid min-w-0 grid-cols-4 gap-0.5 rounded-[11px] bg-[#eceee9] p-[3px] md:grid-cols-2 md:rounded-[9px]"
      >
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={current?.status === status}
            disabled={
              change.isPending ||
              (status === "abandoned" && current?.status === "read")
            }
            onClick={() => choose(status)}
            className={cn(
              "h-11 cursor-pointer rounded-lg px-1 text-[13px] leading-4 disabled:cursor-default md:h-8 md:rounded-md",
              current?.status === status
                ? "bg-surface font-semibold text-ink"
                : "font-medium text-ink-nav disabled:text-control",
            )}
          >
            {t(`statuses.${status}`)}
          </button>
        ))}
      </fieldset>
      <FormError>
        {change.error ? errorMessage(change.error) : undefined}
      </FormError>
      {current && (
        <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border bg-surface px-3.5 py-3 md:mt-0 md:gap-4 md:border-0 md:bg-transparent md:p-0">
          <StatusBody
            book={book}
            current={current}
            finish={
              <Button
                variant="secondary"
                disabled={change.isPending}
                onClick={() => choose("read")}
                className="h-[38px] flex-[1_1_100px]"
              >
                {t("book.finished")}
              </Button>
            }
          />
          <History earlier={data.earlier} />
        </div>
      )}
    </section>
  );
}

/** Asks first unless clearing loses no more than a plain status. */
function ClearStatus({
  current,
  disabled,
  onClear,
}: {
  current: CurrentReading;
  disabled: boolean;
  onClear: () => void;
}) {
  const { t } = useTranslation(["reading", "common"]);
  const format = useFormat();
  const [open, setOpen] = useState(false);
  const date = (value: string) => format.date(fromIsoDate(value));
  const button = (onClick?: () => void) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-11 cursor-pointer pl-4 font-semibold text-accent text-sm hover:text-accent-hover md:h-7 md:pl-0 md:text-[13px]"
    >
      {t("book.clear")}
    </button>
  );
  const ask =
    current.page !== null ||
    current.startedOn !== null ||
    current.status === "read" ||
    current.status === "abandoned";
  if (!ask) return button(onClear);

  const removed = [
    t("book.clearStatus", { status: t(`statuses.${current.status}`) }),
    current.startedOn && t("book.started", { date: date(current.startedOn) }),
    current.page !== null && t("book.clearProgress", { page: current.page }),
    current.status === "read" &&
      (current.endedOn
        ? t("book.finishedOn", { date: date(current.endedOn) })
        : t("book.finishedUndated")),
    current.status === "abandoned" &&
      current.endedOn &&
      t("book.stoppedOn", { date: date(current.endedOn) }),
  ].filter((item) => typeof item === "string");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{button()}</DialogTrigger>
      <DialogContent
        title={t("book.clearTitle")}
        closeLabel={t("common:form.cancel")}
      >
        <div className="flex flex-col gap-2 text-sm">
          <p>{t("book.clearText")}</p>
          <ul className="list-disc pl-5">
            {removed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button
            onClick={() => {
              setOpen(false);
              onClear();
            }}
          >
            {t("book.clear")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBody({
  book,
  current,
  finish,
}: {
  book: BookDetail;
  current: CurrentReading;
  /** The "Finished" button. */
  finish: ReactNode;
}) {
  const { t } = useTranslation("reading");
  const format = useFormat();
  const date = (value: string) => format.date(fromIsoDate(value));
  const info = "text-[13px] text-ink-muted leading-5";

  switch (current.status) {
    case "want":
      return (
        <p className={info}>
          {t("book.wantSince", { date: format.date(current.createdAt) })}
        </p>
      );
    case "reading":
      return (
        <>
          <PageReached page={current.page} pageCount={book.pageCount} />
          <div className="flex flex-wrap gap-2">
            <ProgressDialog
              book={book}
              page={current.page}
              trigger={
                <Button className="h-[38px] flex-[1_1_140px]">
                  {t("book.updateProgress")}
                </Button>
              }
            />
            {finish}
          </div>
          <StartDate bookId={book.id} startedOn={current.startedOn} />
        </>
      );
    case "read":
      return (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <p className="font-semibold text-[15px] leading-[22px]">
            {current.endedOn
              ? t("book.finishedOn", { date: date(current.endedOn) })
              : t("book.finishedUndated")}
          </p>
          <DateDialog
            bookId={book.id}
            kind="finish"
            value={current.endedOn}
            trigger={
              <button type="button" className={textButton}>
                {t("book.changeDate")}
              </button>
            }
          />
          <StartDate bookId={book.id} startedOn={current.startedOn} />
        </div>
      );
    case "abandoned":
      return (
        <>
          <PageReached page={current.page} pageCount={book.pageCount} />
          {current.endedOn && (
            <p className={info}>
              {t("book.stoppedOn", { date: date(current.endedOn) })}
            </p>
          )}
        </>
      );
  }
}

const textButton =
  "h-11 cursor-pointer font-semibold text-accent text-sm hover:text-accent-hover md:h-7 md:text-[13px]";

function StartDate({
  bookId,
  startedOn,
}: {
  bookId: string;
  startedOn: string | null;
}) {
  const { t } = useTranslation("reading");
  const format = useFormat();
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-x-3">
      <p className="text-[13px] text-ink-muted leading-5">
        {startedOn
          ? t("book.started", { date: format.date(fromIsoDate(startedOn)) })
          : t("book.startedUndated")}
      </p>
      <DateDialog
        bookId={bookId}
        kind="start"
        value={startedOn}
        trigger={
          <button type="button" className={textButton}>
            {t("book.changeStartDate")}
          </button>
        }
      />
    </div>
  );
}

export function PageReached({
  page,
  pageCount,
}: {
  page: number | null;
  pageCount: number | null;
}) {
  const { t } = useTranslation("reading");
  if (page === null) {
    return (
      <p className="text-[13px] text-ink-muted leading-5">
        {t("book.noProgress")}
      </p>
    );
  }
  if (!pageCount) {
    return (
      <p className="font-semibold text-[15px] leading-[22px]">
        {t("page", { page })}
      </p>
    );
  }
  const value = percent(page, pageCount);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-[15px] leading-[22px]">
          {t("pageOf", { page, total: pageCount })}
        </span>
        <span className="text-ink-muted text-sm leading-5">
          {t("percent", { percent: value })}
        </span>
      </div>
      <ProgressBar value={value} />
    </div>
  );
}

function History({ earlier }: { earlier: MyReading["earlier"] }) {
  const { t } = useTranslation("reading");
  const monthYear = useMonthYear();
  const last = earlier.find((r) => r.endedOn)?.endedOn;
  if (earlier.length === 0) return null;
  return (
    <p className="text-[13px] text-ink-muted leading-5">
      {t("book.history", { count: earlier.length })}
      {last && t("book.historyFinished", { month: monthYear(last) })}
    </p>
  );
}

/** The other household members' status for the book; hidden when none. */
export function HouseholdReading({
  book,
  className,
}: {
  book: BookDetail;
  className?: string;
}) {
  const { t } = useTranslation("reading");
  const format = useFormat();
  const monthYear = useMonthYear();
  const { data: members = [] } = useQuery(householdQuery(book.id));
  if (members.length === 0) return null;

  const describe = (member: (typeof members)[number]) => {
    if (member.status === "read") {
      return member.endedOn
        ? t("household.readOn", { month: monthYear(member.endedOn) })
        : t("statuses.read");
    }
    if (member.status === "reading" && member.startedOn) {
      return t("household.readingSince", {
        date: format.date(fromIsoDate(member.startedOn)),
      });
    }
    return t(`statuses.${member.status}`);
  };

  return (
    <section
      aria-labelledby="household-title"
      className={cn(
        "flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-4 md:p-5",
        className,
      )}
    >
      <h2 id="household-title" className={cardTitle}>
        {t("household.title")}
      </h2>
      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li key={member.user.id} className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-sm text-white"
              style={{ background: coverColor(member.user.id) }}
            >
              {member.user.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold text-sm leading-5">
                {member.user.name}
              </span>
              <span className="text-[13px] text-ink-muted leading-[18px]">
                {describe(member)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
