import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/shell/page-header";
import { Button, buttonVariants } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { api, unwrap } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useFormat } from "../../lib/format";
import { sessionQuery } from "../../lib/session";
import { BookCover } from "../books/book-cover";
import { fromIsoDate } from "../books/queries";
import { statisticsQuery } from "../statistics/queries";
import { PageReached } from "./book-reading";
import { ProgressDialog } from "./progress-dialog";
import {
  abandonedQuery,
  currentQuery,
  finishedQuery,
  type ReadingItem,
  refreshReading,
  todayIso,
  wantQuery,
} from "./queries";

// The add dialog reads these parameters (built by the catalogue feature).
const addOutsideHref = "/library?add=true&own=reading-list";

const tabs = ["reading", "want", "finished", "abandoned"] as const;
type Tab = (typeof tabs)[number];

const desktop = "(min-width: 48rem)";
const subscribeDesktop = (onChange: () => void) => {
  const query = window.matchMedia(desktop);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useDesktop = () =>
  useSyncExternalStore(subscribeDesktop, () => matchMedia(desktop).matches);

const sectionTitle =
  "font-semibold font-serif text-xl leading-[26px] max-md:font-sans max-md:text-ink-muted max-md:text-xs max-md:uppercase max-md:leading-[18px] max-md:tracking-[0.06em]";
const muted = "text-ink-muted text-sm leading-5";
const textButton =
  "cursor-pointer font-semibold text-accent text-sm hover:text-accent-hover";

export function ReadingPage() {
  const { t } = useTranslation("reading");
  const isDesktop = useDesktop();
  const [tab, setTab] = useState<Tab>("reading");
  const shows = (section: Tab) => isDesktop || tab === section;
  const { data: session } = useQuery(sessionQuery);
  const year = new Date().getFullYear();
  const finishedThisYear = useInfiniteQuery(finishedQuery(year));
  const finishedCount = finishedThisYear.data?.pages[0]?.total;

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={
          session && finishedCount !== undefined
            ? t("subtitle", {
                name: session.user.name,
                count: finishedCount,
                year,
              })
            : undefined
        }
        actions={
          <a
            href={addOutsideHref}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "max-md:hidden",
            )}
          >
            {t("addOutside")}
          </a>
        }
      />
      <fieldset
        aria-label={t("tabs.label")}
        className="-mt-2 mb-4 grid min-w-0 grid-cols-4 gap-0.5 rounded-[11px] bg-[#eceee9] p-[3px] md:hidden"
      >
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "h-11 cursor-pointer rounded-lg px-1 text-[13px] leading-4",
              tab === key
                ? "bg-surface font-semibold text-ink"
                : "font-medium text-ink-nav",
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </fieldset>
      <div className="flex flex-col gap-7">
        {shows("reading") && <CurrentlyReading />}
        {!isDesktop && tab === "reading" && (
          <>
            <WantSection reach="within" upNext />
            <a
              href={addOutsideHref}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-control border-dashed font-medium text-[15px] text-ink no-underline hover:text-ink"
            >
              <Plus aria-hidden size={18} />
              {t("addOutside")}
            </a>
          </>
        )}
        {shows("want") && (
          <>
            <WantSection reach="within" />
            <WantSection reach="wishlist" />
          </>
        )}
        {shows("finished") && <FinishedSection />}
        {shows("abandoned") && <AbandonedSection />}
      </div>
    </>
  );
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className={sectionTitle}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function BookTitleLink({ book }: { book: ReadingItem["book"] }) {
  return (
    <Link
      to="/books/$bookId"
      params={{ bookId: book.id }}
      className="text-ink no-underline hover:text-ink hover:underline"
    >
      {book.title}
    </Link>
  );
}

const useFinish = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookId: string) =>
      unwrap(
        api.reading.books[":bookId"].finish.$post({
          param: { bookId },
          json: { date: todayIso() },
        }),
      ),
    onSuccess: () => refreshReading(queryClient),
  });
};

function CurrentlyReading() {
  const { t } = useTranslation("reading");
  const format = useFormat();
  const { data } = useQuery(currentQuery);
  const finish = useFinish();
  if (!data) return null;

  return (
    <Section id="current-title" title={t("current.title")}>
      {data.items.length === 0 ? (
        <p className={muted}>{t("current.empty")}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-3 md:gap-4">
          {data.items.map((item) => (
            <li
              key={item.id}
              className="flex gap-3.5 rounded-xl border border-border bg-surface p-3.5 md:gap-5 md:p-5"
            >
              <BookCover
                id={item.book.id}
                title={item.book.title}
                authors={item.book.authors}
                imageUrl={item.book.thumbnailUrl}
                size="small"
                className="md:h-[132px] md:w-[88px]"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-1">
                <h3 className="font-semibold font-serif text-[17px] leading-[22px] md:text-lg md:leading-6">
                  <BookTitleLink book={item.book} />
                </h3>
                <p className={muted}>
                  {[
                    item.book.authors.join(", "),
                    item.startedOn &&
                      t("current.started", {
                        date: format.date(fromIsoDate(item.startedOn)),
                      }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {!item.inLibrary && <OutsideBadge />}
                <div className="mt-auto flex flex-col gap-2 pt-2.5 md:pt-3">
                  <PageReached
                    page={item.page}
                    pageCount={item.book.pageCount}
                  />
                  <div className="mt-1 flex flex-wrap gap-2">
                    <ProgressDialog
                      book={item.book}
                      page={item.page}
                      trigger={
                        <Button className="h-9 px-3 md:px-3.5">
                          {t("book.updateProgress")}
                        </Button>
                      }
                    />
                    <Button
                      variant="secondary"
                      disabled={finish.isPending}
                      onClick={() => finish.mutate(item.book.id)}
                      className="h-9 px-3 md:px-3.5"
                    >
                      {t("book.finished")}
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function OutsideBadge() {
  const { t } = useTranslation("reading");
  return (
    <span className="mt-0.5 self-start rounded-full bg-[#e6e9e3] px-2 py-px font-medium text-ink-nav text-xs leading-[18px]">
      {t("notInLibrary")}
    </span>
  );
}

const coverWidth = 92;
const coverGap = 16;

/** How many covers of the row fit next to each other. */
function useColumns() {
  const [columns, setColumns] = useState(1);
  const ref = useCallback((element: HTMLUListElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setColumns(
        Math.max(1, Math.floor((width + coverGap) / (coverWidth + coverGap))),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, columns };
}

function WantSection({
  reach,
  upNext = false,
}: {
  reach: "within" | "wishlist";
  /** The phone's short "Up next" row on the Reading tab. */
  upNext?: boolean;
}) {
  const { t } = useTranslation("reading");
  const list = useInfiniteQuery(wantQuery(reach));
  const [expanded, setExpanded] = useState(false);
  const { ref, columns } = useColumns();
  const pages = list.data?.pages ?? [];
  const first = pages[0];
  if (!first || (upNext && first.total === 0)) return null;

  const items = pages.flatMap((page) => page.items);
  const key = reach === "within" ? "want" : "wishlist";
  const id = upNext ? "up-next-title" : `${key}-title`;
  return (
    <Section
      id={id}
      title={upNext ? t("upNext") : t(`${key}.title`)}
      aside={
        !upNext && (
          <span className={muted}>
            {t(`${key}.total`, { count: first.total })}
            {first.total > columns && (
              <>
                {" · "}
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded(!expanded)}
                  className={textButton}
                >
                  {expanded ? t("showLess") : t("showAll")}
                </button>
              </>
            )}
          </span>
        )
      }
    >
      {first.total === 0 && <p className={muted}>{t(`${key}.empty`)}</p>}
      <ul
        ref={ref}
        aria-labelledby={id}
        className="grid grid-cols-[repeat(auto-fill,minmax(min(92px,100%),1fr))] gap-x-4 gap-y-5"
      >
        {(expanded ? items : items.slice(0, columns)).map((item) => (
          <li key={item.id} className="min-w-0">
            <Link
              to="/books/$bookId"
              params={{ bookId: item.book.id }}
              className="flex min-w-0 flex-col text-ink no-underline hover:text-ink"
            >
              <BookCover
                id={item.book.id}
                title={item.book.title}
                authors={item.book.authors}
                imageUrl={item.book.thumbnailUrl}
                size="grid"
                className="md:px-2.5 md:pt-3 md:pb-2.5 md:pl-3.5 md:shadow-[inset_5px_0_0_rgba(0,0,0,0.16)] md:[&>span:first-child]:text-[13px] md:[&>span:first-child]:leading-[17px] md:[&>span:last-child]:hidden [&>span:first-child]:pr-0"
              />
              <span className="mt-2 truncate font-semibold text-[13px] leading-[18px]">
                {item.book.title}
              </span>
              <span className="truncate text-ink-muted text-xs leading-[18px]">
                {item.borrowed && !item.inLibrary
                  ? t("want.borrowed")
                  : item.book.authors.join(", ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {expanded && <LoadMore list={list} />}
    </Section>
  );
}

function LoadMore({
  list,
}: {
  list: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
}) {
  const { t } = useTranslation("reading");
  if (!list.hasNextPage) return null;
  return (
    <Button
      variant="secondary"
      disabled={list.isFetchingNextPage}
      onClick={() => list.fetchNextPage()}
      className="self-center"
    >
      {t("loadMore")}
    </Button>
  );
}

const th =
  "px-4 py-2.5 text-left font-semibold text-ink-muted text-xs leading-[18px]";
const td = "px-4 py-2.5";
const collapsedRows = 6;

function Table({
  label,
  head,
  children,
}: {
  label: string;
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table
        aria-label={label}
        className="w-full min-w-[600px] border-collapse text-sm leading-5"
      >
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody className="[&>tr]:border-border [&>tr]:border-t">
          {children}
        </tbody>
      </table>
    </div>
  );
}

function BookCell({ book }: { book: ReadingItem["book"] }) {
  return (
    <td className={td}>
      <div className="font-semibold">
        <BookTitleLink book={book} />
      </div>
      <div className="text-[13px] text-ink-muted leading-[18px]">
        {book.authors.join(", ")}
      </div>
    </td>
  );
}

function FinishedSection() {
  const { t } = useTranslation("reading");
  const format = useFormat();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number | "undated">(thisYear);
  const [expanded, setExpanded] = useState(false);
  const { data: session } = useQuery(sessionQuery);
  const { data: stats } = useQuery({
    ...statisticsQuery(session?.user.id, thisYear),
    enabled: !!session,
  });
  const list = useInfiniteQuery(finishedQuery(year));
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const years = [...new Set([thisYear, year, ...(stats?.years ?? [])])]
    .filter((y) => y !== "undated")
    .sort((a, b) => Number(b) - Number(a));

  return (
    <Section
      id="finished-title"
      title={t("finished.title")}
      aside={
        <div className="flex items-center gap-4">
          <Link to="/statistics" className="font-semibold text-sm no-underline">
            {t("finished.statistics")}
          </Link>
          <Select
            aria-label={t("finished.year")}
            value={String(year)}
            onChange={(event) => {
              const value = event.target.value;
              setYear(value === "undated" ? value : Number(value));
              setExpanded(false);
            }}
            className="h-[34px] rounded-full pr-2 pl-3.5 font-medium text-[13px]"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            <option value="undated">{t("finished.undated")}</option>
          </Select>
        </div>
      }
    >
      {first?.total === 0 ? (
        <p className={muted}>
          {year === "undated"
            ? t("finished.emptyUndated")
            : t("finished.empty", { year })}
        </p>
      ) : (
        first && (
          <>
            <Table
              label={t("finished.title")}
              head={
                <>
                  <th scope="col" className={th}>
                    {t("finished.book")}
                  </th>
                  <th scope="col" className={th}>
                    {t("finished.date")}
                  </th>
                  <th scope="col" className={cn(th, "text-right")}>
                    {t("finished.pages")}
                  </th>
                  <th scope="col" className={th}>
                    {t("finished.readAs")}
                  </th>
                </>
              }
            >
              {(expanded ? items : items.slice(0, collapsedRows)).map(
                (item) => (
                  <tr key={item.id}>
                    <BookCell book={item.book} />
                    <td className={td}>
                      {item.endedOn
                        ? format.date(fromIsoDate(item.endedOn))
                        : t("finished.dateUnknown")}
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>
                      {item.book.pageCount ?? "–"}
                    </td>
                    <td className={td}>
                      {item.inLibrary
                        ? t("finished.libraryCopy")
                        : t("notInLibrary")}
                    </td>
                  </tr>
                ),
              )}
            </Table>
            {first.total > collapsedRows && (
              <p className="text-[13px] text-ink-muted leading-5">
                {!expanded &&
                  `${t("finished.showing", {
                    shown: collapsedRows,
                    total: first.total,
                  })} · `}
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded(!expanded)}
                  className={cn(textButton, "text-[13px]")}
                >
                  {expanded ? t("showLess") : t("showAll")}
                </button>
              </p>
            )}
            {expanded && <LoadMore list={list} />}
          </>
        )
      )}
    </Section>
  );
}

function AbandonedSection() {
  const { t } = useTranslation("reading");
  const format = useFormat();
  const queryClient = useQueryClient();
  const list = useInfiniteQuery(abandonedQuery);
  const pickUp = useMutation({
    mutationFn: (bookId: string) =>
      unwrap(
        api.reading.books[":bookId"].$put({
          param: { bookId },
          json: { status: "reading", date: todayIso() },
        }),
      ),
    onSuccess: () => refreshReading(queryClient),
  });
  const pages = list.data?.pages ?? [];
  const first = pages[0];
  if (!first) return null;
  const items = pages.flatMap((page) => page.items);

  return (
    <Section id="abandoned-title" title={t("abandoned.title")}>
      {first.total === 0 ? (
        <p className={muted}>{t("abandoned.empty")}</p>
      ) : (
        <>
          <Table
            label={t("abandoned.title")}
            head={
              <>
                <th scope="col" className={th}>
                  {t("abandoned.book")}
                </th>
                <th scope="col" className={th}>
                  {t("abandoned.stopped")}
                </th>
                <th scope="col" className={th}>
                  {t("abandoned.gotTo")}
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">{t("abandoned.action")}</span>
                </th>
              </>
            }
          >
            {items.map((item) => (
              <tr key={item.id}>
                <BookCell book={item.book} />
                <td className={td}>
                  {item.endedOn && format.date(fromIsoDate(item.endedOn))}
                </td>
                <td className={td}>
                  {item.page === null
                    ? "–"
                    : item.book.pageCount
                      ? t("pageOf", {
                          page: item.page,
                          total: item.book.pageCount,
                        })
                      : t("page", { page: item.page })}
                </td>
                <td className={cn(td, "text-right")}>
                  <Button
                    variant="secondary"
                    disabled={pickUp.isPending}
                    onClick={() => pickUp.mutate(item.book.id)}
                    className="h-9 whitespace-nowrap px-3.5"
                  >
                    {t("abandoned.pickUp")}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          <LoadMore list={list} />
        </>
      )}
    </Section>
  );
}
