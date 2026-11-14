import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/shell/page-header";
import { cn } from "../../lib/cn";
import { useFormat } from "../../lib/format";
import { sessionQuery } from "../../lib/session";
import { Card } from "./card";
import { MonthChart } from "./month-chart";
import { membersQuery, statisticsQuery } from "./queries";

const household = "household";

export function StatisticsPage() {
  const { t, i18n } = useTranslation("statistics");
  const format = useFormat();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { data: session } = useQuery(sessionQuery);
  const { data: members = [] } = useQuery(membersQuery);
  const [chosen, setChosen] = useState<string>();
  const who = chosen ?? session?.user.id ?? household;
  const userId = who === household ? undefined : who;
  const { data: stats } = useQuery({
    ...statisticsQuery(userId, year),
    placeholderData: (previous) => previous,
  });

  const me = members.find((m) => m.id === session?.user.id);
  const choices = [
    ...(me ? [me] : []),
    ...members.filter((m) => m !== me),
    { id: household, name: t("household") },
  ];
  const name = members.find((m) => m.id === who)?.name;
  const years = [thisYear, ...(stats?.years ?? [])];

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={
          name
            ? t("subtitle", { name, year })
            : t("subtitleHousehold", { year })
        }
        actions={
          <div className="flex w-full flex-wrap items-center gap-3 max-md:flex-col-reverse max-md:items-stretch md:w-auto">
            <fieldset
              aria-label={t("whose")}
              className="flex min-w-0 gap-0.5 rounded-[11px] bg-[#eceee9] p-[3px] md:rounded-[9px]"
            >
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  aria-pressed={who === choice.id}
                  onClick={() => setChosen(choice.id)}
                  className={cn(
                    "h-11 flex-1 cursor-pointer rounded-lg px-3.5 text-sm md:h-[34px] md:flex-none md:rounded-md md:text-[13px]",
                    who === choice.id
                      ? "bg-surface font-semibold text-ink"
                      : "font-medium text-ink-nav",
                  )}
                >
                  {choice.name}
                </button>
              ))}
            </fieldset>
            <div className="flex items-center justify-center gap-1 rounded-lg md:h-10 md:border md:border-control md:bg-surface md:px-1">
              <StepButton
                label={t("previousYear")}
                disabled={year <= Math.min(...years)}
                onClick={() => setYear(year - 1)}
              >
                <ChevronLeft aria-hidden size={16} />
              </StepButton>
              <span
                aria-live="polite"
                className="min-w-11 text-center font-semibold text-base tabular-nums md:text-sm"
              >
                {year}
              </span>
              <StepButton
                label={t("nextYear")}
                disabled={year >= Math.max(...years)}
                onClick={() => setYear(year + 1)}
              >
                <ChevronRight aria-hidden size={16} />
              </StepButton>
            </div>
          </div>
        }
      />
      {stats && (
        <div className="flex flex-col gap-3 md:gap-6">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] md:gap-4">
            <Tile
              label={t("tiles.booksFinished")}
              value={format.number(stats.booksFinished)}
              note={t("tiles.previousYear", {
                count:
                  stats.booksPerYear.find((y) => y.year === year - 1)?.books ??
                  0,
                year: year - 1,
              })}
            />
            <Tile
              label={t("tiles.pagesRead")}
              value={format.number(stats.pagesRead)}
              note={t("tiles.perDay", {
                value: format.number(stats.pagesPerDay),
              })}
            />
            <Tile
              label={t("tiles.pagesPerDay")}
              value={format.number(stats.pagesPerDay)}
              className="md:hidden"
            />
            <Tile
              label={t("tiles.outside")}
              value={format.number(stats.notInLibrary)}
              note={t("tiles.ofBooks", { count: stats.booksFinished })}
            />
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] gap-3 md:gap-4">
            <MonthChart
              title={t("charts.booksPerMonth")}
              unit={t("charts.books")}
              values={stats.booksPerMonth}
              currentMonth={year === thisYear ? new Date().getMonth() : null}
            />
            <MonthChart
              title={t("charts.pagesPerMonth")}
              unit={t("charts.pages")}
              values={stats.pagesPerMonth}
              currentMonth={year === thisYear ? new Date().getMonth() : null}
            />
            <Card title={t("perYear.title")}>
              <PerYear
                rows={[
                  ...stats.booksPerYear.map((y) => ({
                    label: String(y.year),
                    books: y.books,
                  })),
                  ...(stats.undated
                    ? [{ label: t("perYear.undated"), books: stats.undated }]
                    : []),
                ]}
              />
              <p className="text-[13px] text-ink-muted leading-5">
                {t("perYear.allTime", { count: stats.allTime })}
                {stats.booksPerYear.some((y) => y.year === thisYear) &&
                  ` ${t("perYear.untilToday", {
                    year: thisYear,
                    date: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                      day: "numeric",
                      month: "long",
                    }).format(new Date()),
                  })}`}
              </p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 cursor-pointer items-center justify-center rounded-md text-ink hover:bg-sidebar disabled:cursor-default disabled:text-control disabled:hover:bg-transparent md:size-8"
    >
      {children}
    </button>
  );
}

function Tile({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "flex flex-col rounded-xl border border-border bg-surface px-3.5 py-2.5 md:gap-0.5 md:px-5 md:py-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="text-ink-muted text-xs leading-4 md:text-[13px] md:leading-[18px]"
      >
        {label}
      </span>
      <span className="font-semibold font-serif text-2xl tabular-nums leading-[30px] md:text-[32px] md:leading-10">
        {value}
      </span>
      {note && (
        <span className="text-[13px] text-ink-muted leading-[18px] max-md:hidden">
          {note}
        </span>
      )}
    </section>
  );
}

function PerYear({ rows }: { rows: { label: string; books: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.books));
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <dt className="min-w-10 text-[13px] text-ink-muted tabular-nums leading-5">
            {row.label}
          </dt>
          <dd className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden
              className="h-5 rounded-r bg-accent"
              style={{ width: `${(row.books / max) * 88}%` }}
            />
            <span className="font-semibold text-[13px] tabular-nums leading-5">
              {row.books}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
