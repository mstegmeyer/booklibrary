import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  ChevronDown,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { RadioGroup } from "radix-ui";
import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader } from "../../components/shell/page-header";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { cn } from "../../lib/cn";
import { AddBookDialog } from "../books/add-book-dialog";
import { useSortedGenres } from "../genres/queries";
import { formatPath, locationsQuery } from "../locations/queries";
import { BookGrid, BookList } from "./book-views";
import { libraryQuery, summaryQuery } from "./queries";
import { forgetOpenedBook, rememberLibrary } from "./return-to-library";
import {
  availabilities,
  filtersOf,
  formats,
  hasFilters,
  type LibraryFilters,
  type LibrarySearch,
  readingFilters,
  sorts,
} from "./search";

const viewKey = "library.view";
type View = "grid" | "list";

const desktop = "(min-width: 48rem)";
const subscribeDesktop = (onChange: () => void) => {
  const query = window.matchMedia(desktop);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useDesktop = () =>
  useSyncExternalStore(subscribeDesktop, () => matchMedia(desktop).matches);

/** "No genre", then the genres alphabetically. */
function useGenreOptions() {
  const { t } = useTranslation("genres");
  return [
    { value: "none", label: t("none") },
    ...useSortedGenres().map((genre) => ({
      value: genre.id,
      label: genre.label,
    })),
  ];
}

export function LibraryPage() {
  const { t } = useTranslation(["library", "genres"]);
  const genreOptions = useGenreOptions();
  const search = useSearch({ from: "/_app/library" });
  const navigate = useNavigate({ from: "/library" });
  const filters = filtersOf(search);
  const setSearch = (changes: Partial<LibrarySearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...changes }), replace: true });

  useEffect(() => rememberLibrary(filters));
  useEffect(forgetOpenedBook, []);

  const [view, setView] = useState<View>(() =>
    localStorage.getItem(viewKey) === "list" ? "list" : "grid",
  );
  const chooseView = (next: View) => {
    localStorage.setItem(viewKey, next);
    setView(next);
  };
  const isDesktop = useDesktop();

  const summary = useQuery(summaryQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const books = useInfiniteQuery(libraryQuery(filters));
  const items = books.data?.pages.flatMap((page) => page.items) ?? [];
  const total = books.data?.pages[0]?.total ?? 0;

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = books;
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "800px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const places = locations.filter((node) => node.parentId === null);
  const selectedLocation = locations.find((n) => n.id === filters.location);

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={summary.data && summaryText(t, summary.data)}
        actions={
          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
            <SearchBox
              value={filters.q ?? ""}
              onChange={(q) => setSearch({ q: q || undefined })}
            />
            <SortFilterSheet filters={filters} onChange={setSearch} />
            <div className="hidden overflow-hidden rounded-lg border border-control md:flex">
              <ViewButton
                label={t("gridView")}
                pressed={view === "grid"}
                onClick={() => chooseView("grid")}
              >
                <LayoutGrid aria-hidden size={16} />
              </ViewButton>
              <ViewButton
                label={t("listView")}
                pressed={view === "list"}
                onClick={() => chooseView("list")}
              >
                <List aria-hidden size={16} />
              </ViewButton>
            </div>
          </div>
        }
      />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:mb-6 md:flex-wrap md:items-center md:overflow-visible md:px-0">
        <Pill
          pressed={!filters.location}
          count={summary.data?.books}
          onClick={() => setSearch({ location: undefined })}
        >
          <span className="md:hidden">{t("all")}</span>
          <span className="hidden md:inline">{t("allPlaces")}</span>
        </Pill>
        {places.map((place) => (
          <Pill
            key={place.id}
            pressed={filters.location === place.id}
            count={place.bookCount}
            countOnPhone={false}
            onClick={() => setSearch({ location: place.id })}
          >
            {place.name}
          </Pill>
        ))}
        {selectedLocation?.parentId && (
          <Pill pressed onClick={() => setSearch({ location: undefined })}>
            {formatPath(selectedLocation.path)}
          </Pill>
        )}
        <span className="md:hidden">
          <Pill
            pressed={filters.availability === "lent"}
            onClick={() =>
              setSearch({
                availability:
                  filters.availability === "lent" ? undefined : "lent",
              })
            }
          >
            {t("lentOutFilter")}
          </Pill>
        </span>
        <span className="md:hidden">
          <Pill
            pressed={filters.format === "ebook"}
            onClick={() =>
              setSearch({
                format: filters.format === "ebook" ? undefined : "ebook",
              })
            }
          >
            {t("ebooksFilter")}
          </Pill>
        </span>
        <span
          aria-hidden
          className="mx-2 hidden h-5 w-px bg-[#c9cdc7] md:block"
        />
        <div className="hidden gap-2 md:flex">
          <FilterMenu
            label={t("format.label")}
            value={filters.format}
            options={formats.map((value) => ({
              value,
              label: t(`format.${value}`),
            }))}
            anyLabel={t("format.any")}
            onChange={(format) => setSearch({ format })}
          />
          <FilterMenu
            label={t("availability.label")}
            value={filters.availability}
            options={availabilities.map((value) => ({
              value,
              label: t(`availability.${value}`),
            }))}
            anyLabel={t("availability.any")}
            onChange={(availability) => setSearch({ availability })}
          />
          <FilterMenu
            label={t("reading.label")}
            value={filters.reading}
            options={readingFilters.map((value) => ({
              value,
              label: t(`reading.${value}`),
            }))}
            anyLabel={t("reading.any")}
            onChange={(reading) => setSearch({ reading })}
          />
          <FilterMenu
            label={t("genres:genre")}
            value={filters.genre}
            options={genreOptions}
            anyLabel={t("anyGenre")}
            onChange={(genre) => setSearch({ genre })}
          />
        </div>
        <div className="ml-auto hidden md:block">
          <SortMenu
            value={filters.sort ?? "added"}
            onChange={(sort) =>
              setSearch({ sort: sort === "added" ? undefined : sort })
            }
          />
        </div>
      </div>

      {books.isSuccess && items.length === 0 && (
        <EmptyState>
          {hasFilters(filters) ? (
            <>
              <p>{t("noMatches")}</p>
              <Link
                to="/library"
                search={{}}
                className="mt-2 inline-block font-semibold"
              >
                {t("clearFilters")}
              </Link>
            </>
          ) : (
            <>
              <p>{t("empty")}</p>
              <Link
                to="/library"
                search={{ add: true }}
                className="mt-2 inline-block font-semibold"
              >
                {t("addFirst")}
              </Link>
            </>
          )}
        </EmptyState>
      )}

      {items.length > 0 &&
        (view === "list" && isDesktop ? (
          <BookList items={items} />
        ) : (
          <BookGrid items={items} />
        ))}

      <div ref={sentinel} />
      {items.length > 0 && (
        <p className="mt-6 text-center text-[13px] text-ink-muted leading-5">
          {t("shown", { shown: items.length, total })}
          {hasNextPage && ` · ${t("moreOnScroll")}`}
        </p>
      )}

      <AddBookDialog
        open={search.add === true}
        own={search.own}
        isbn={search.isbn}
        onOpenChange={(open) =>
          setSearch({ add: open || undefined, own: undefined, isbn: undefined })
        }
      />
    </>
  );
}

function summaryText(
  t: TFunction<"library">,
  summary: { books: number; places: number; lentOut: number },
) {
  let text = t("books", { count: summary.books });
  if (summary.places > 0)
    text += ` ${t("inPlaces", { count: summary.places })}`;
  if (summary.lentOut > 0)
    text += ` · ${t("lentOut", { count: summary.lentOut })}`;
  return text;
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("library");
  const [text, setText] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => latest.current(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-[#eceee9] px-3 text-ink-muted md:h-10 md:w-80 md:flex-none md:rounded-lg md:border md:border-control md:bg-surface">
      <Search aria-hidden size={16} />
      <input
        type="search"
        aria-label={t("search")}
        placeholder={t("searchPlaceholder")}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none md:text-sm"
      />
    </label>
  );
}

function ViewButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex h-[38px] w-10 cursor-pointer items-center justify-center",
        pressed ? "bg-ink text-white" : "bg-surface text-ink hover:bg-ground",
      )}
    >
      {children}
    </button>
  );
}

const pillClass =
  "flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 font-medium text-sm md:text-[13px]";
const pillState = (active: boolean) =>
  active
    ? "border-ink bg-ink text-white"
    : "border-control bg-surface text-ink hover:bg-ground";

function Pill({
  pressed,
  count,
  countOnPhone = true,
  onClick,
  children,
}: {
  pressed: boolean;
  count?: number;
  countOnPhone?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="flex h-11 shrink-0 cursor-pointer items-center md:h-auto"
    >
      <span className={cn(pillClass, pillState(pressed))}>
        {children}
        {count !== undefined && (
          <span
            className={cn(
              pressed ? "text-[#d5d9d4]" : "text-ink-muted",
              !countOnPhone && "hidden md:inline",
            )}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

function FilterMenu<T extends string>({
  label,
  value,
  options,
  anyLabel,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  anyLabel: string;
  onChange: (value: T | undefined) => void;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          pillClass,
          pillState(Boolean(current)),
          "cursor-pointer pr-2.5",
        )}
      >
        {current ? `${label}: ${current.label}` : label}
        <ChevronDown aria-hidden size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value ?? ""}
          onValueChange={(next) =>
            onChange(options.find((o) => o.value === next)?.value)
          }
        >
          <DropdownMenuRadioItem value="">{anyLabel}</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: (typeof sorts)[number];
  onChange: (value: (typeof sorts)[number]) => void;
}) {
  const { t } = useTranslation("library");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("sort.label")}: ${t(`sort.${value}`)}`}
        className="flex h-[34px] cursor-pointer items-center gap-1 pr-1.5 pl-2.5 font-medium text-[13px]"
      >
        {t(`sort.${value}`)}
        <ChevronDown aria-hidden size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) =>
            onChange(sorts.find((sort) => sort === next) ?? "added")
          }
        >
          {sorts.map((sort) => (
            <DropdownMenuRadioItem key={sort} value={sort}>
              {t(`sort.${sort}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone's way to the sort and the filters of the desktop row. */
function SortFilterSheet({
  filters,
  onChange,
}: {
  filters: LibraryFilters;
  onChange: (changes: Partial<LibrarySearch>) => void;
}) {
  const { t } = useTranslation(["library", "genres"]);
  const genreOptions = useGenreOptions();
  const activeId = useId();
  const [open, setOpen] = useState(false);
  const active = Boolean(
    filters.sort ||
      filters.format ||
      filters.availability ||
      filters.reading ||
      filters.genre,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={t("sheet.title")}
        aria-describedby={active ? activeId : undefined}
        className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-[#eceee9] text-ink md:hidden"
      >
        <SlidersHorizontal aria-hidden size={18} />
        {active && (
          <span
            aria-hidden
            className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-[#eceee9] bg-accent"
          />
        )}
      </DialogTrigger>
      <span id={activeId} hidden>
        {t("sheet.active")}
      </span>
      <DialogContent
        title={t("sheet.title")}
        closeLabel={t("sheet.close")}
        layout="sheet"
      >
        <Choices
          label={t("sheet.sortBy")}
          value={filters.sort}
          options={sorts.map((value) => ({
            value: value === "added" ? undefined : value,
            label: t(`sort.${value}`),
          }))}
          onChange={(sort) => onChange({ sort })}
        />
        <Choices
          label={t("format.label")}
          value={filters.format}
          options={[
            { value: undefined, label: t("format.any") },
            ...formats.map((value) => ({
              value,
              label: t(`format.${value}`),
            })),
          ]}
          onChange={(format) => onChange({ format })}
        />
        <Choices
          label={t("availability.label")}
          value={filters.availability}
          options={[
            { value: undefined, label: t("availability.any") },
            ...availabilities.map((value) => ({
              value,
              label: t(`availability.${value}`),
            })),
          ]}
          onChange={(availability) => onChange({ availability })}
        />
        <Choices
          label={t("reading.label")}
          value={filters.reading}
          options={[
            { value: undefined, label: t("reading.any") },
            ...readingFilters.map((value) => ({
              value,
              label: t(`reading.${value}`),
            })),
          ]}
          onChange={(reading) => onChange({ reading })}
        />
        <Choices
          label={t("genres:genre")}
          value={filters.genre}
          options={[
            { value: undefined, label: t("anyGenre") },
            ...genreOptions,
          ]}
          onChange={(genre) => onChange({ genre })}
        />
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              onChange({
                sort: undefined,
                format: undefined,
                availability: undefined,
                reading: undefined,
                genre: undefined,
              })
            }
            className="h-12 rounded-xl text-base"
          >
            {t("sheet.reset")}
          </Button>
          <Button
            onClick={() => setOpen(false)}
            className="h-12 rounded-xl text-base"
          >
            {t("sheet.done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: { value: T | undefined; label: string }[];
  onChange: (value: T | undefined) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="font-semibold text-[13px] leading-[18px]">
        {label}
      </span>
      <RadioGroup.Root
        aria-labelledby={labelId}
        value={value ?? ""}
        onValueChange={(next) =>
          onChange(options.find((o) => (o.value ?? "") === next)?.value)
        }
        className="flex flex-wrap gap-x-2"
      >
        {options.map((option) => (
          <RadioGroup.Item
            key={option.label}
            value={option.value ?? ""}
            className="flex h-11 cursor-pointer items-center"
          >
            <span className={cn(pillClass, pillState(option.value === value))}>
              {option.label}
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}
