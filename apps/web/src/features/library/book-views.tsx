import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BookCover } from "../books/book-cover";
import type { LibraryItem } from "./queries";
import { markOpenedFromLibrary } from "./return-to-library";

/** The last two levels of the path, as the grid and list show it. */
const shortPath = (path: string[]) => path.slice(-2).join(" · ");

function BookLink({
  item,
  className,
  children,
}: {
  item: LibraryItem;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/books/$bookId"
      params={{ bookId: item.id }}
      onClick={markOpenedFromLibrary}
      className={className}
    >
      {children}
    </Link>
  );
}

const lentBadge =
  "rounded-full bg-lent-tint px-2 font-medium text-lent text-xs leading-[18px]";

export function BookGrid({ items }: { items: LibraryItem[] }) {
  const { t } = useTranslation("library");
  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-4 md:grid-cols-[repeat(auto-fill,minmax(min(140px,100%),1fr))] md:gap-x-7 md:gap-y-8">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <BookLink
            item={item}
            className="flex min-w-0 flex-col text-ink no-underline hover:text-ink"
          >
            <BookCover
              id={item.id}
              title={item.title}
              authors={item.authors}
              imageUrl={item.thumbnailUrl}
              size="grid"
            >
              {item.reading?.status === "read" && (
                <span className="absolute top-1.5 right-1.5 flex size-[18px] items-center justify-center rounded-full bg-white text-accent md:top-2 md:right-2 md:size-[22px]">
                  <Check
                    role="img"
                    aria-label={t("youReadThis")}
                    size={12}
                    strokeWidth={3}
                    className="md:size-3.5"
                  />
                </span>
              )}
              {item.reading?.status === "reading" &&
                item.reading.progress !== null && (
                  <span className="absolute right-0 bottom-0 left-1 h-1 bg-white/35 md:left-1.5 md:h-[5px]">
                    <span
                      className="block h-full bg-white"
                      style={{ width: `${item.reading.progress}%` }}
                    />
                  </span>
                )}
              {item.availability === "lent" && (
                <span className="absolute bottom-2 left-3 rounded-full bg-lent-tint px-[7px] font-semibold text-[11px] text-lent leading-[18px] md:hidden">
                  {t("lentOutFilter")}
                </span>
              )}
            </BookCover>
            <span className="mt-1.5 truncate font-semibold text-[13px] leading-4 md:mt-2.5 md:text-sm md:leading-5">
              {item.title}
            </span>
            <span className="truncate text-ink-muted text-xs leading-4 md:text-[13px] md:leading-[18px]">
              {item.authors.join(", ")}
            </span>
            {item.availability === "lent" ? (
              <span className={`mt-1 hidden self-start md:block ${lentBadge}`}>
                {t("lentTo", { name: item.lentTo })}
              </span>
            ) : (
              <span className="mt-1 hidden truncate text-ink-muted text-xs leading-[18px] md:block">
                {item.locationPath.length > 0
                  ? shortPath(item.locationPath)
                  : t("noLocation")}
              </span>
            )}
          </BookLink>
        </li>
      ))}
    </ul>
  );
}

const columns =
  "grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_90px_170px_64px] gap-x-4";

export function BookList({ items }: { items: LibraryItem[] }) {
  const { t } = useTranslation("library");
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div className="min-w-[720px]">
        <div
          className={`${columns} px-4 py-2.5 font-semibold text-ink-muted text-xs leading-[18px]`}
        >
          <span>{t("columns.book")}</span>
          <span>{t("columns.location")}</span>
          <span>{t("columns.copies")}</span>
          <span>{t("columns.reading")}</span>
          <span className="text-right">{t("columns.pages")}</span>
        </div>
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-border border-t">
              <BookLink
                item={item}
                className={`${columns} min-h-[62px] items-center px-4 py-2 text-ink text-sm no-underline hover:bg-ground hover:text-ink`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <BookCover
                    id={item.id}
                    title={item.title}
                    authors={item.authors}
                    imageUrl={item.thumbnailUrl}
                    size="spine"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{item.title}</span>
                    <span className="truncate text-[13px] text-ink-muted leading-[18px]">
                      {item.authors.join(", ")}
                    </span>
                  </span>
                </span>
                <span className="flex min-w-0 flex-col items-start">
                  {item.availability === "lent" ? (
                    <span className={lentBadge}>
                      {t("lentTo", { name: item.lentTo })}
                    </span>
                  ) : item.locationPath.length > 0 ? (
                    <span className="max-w-full truncate">
                      {shortPath(item.locationPath)}
                    </span>
                  ) : (
                    <span className="text-ink-muted">{t("noLocation")}</span>
                  )}
                </span>
                <span className="tabular-nums">{item.copyCount}</span>
                <ReadingCell reading={item.reading} />
                <span className="text-right tabular-nums">
                  {item.pageCount ?? ""}
                </span>
              </BookLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ReadingCell({ reading }: { reading: LibraryItem["reading"] }) {
  const { t } = useTranslation("library");
  if (!reading)
    return <span className="text-ink-muted">{t("reading.none")}</span>;
  if (reading.status === "reading" && reading.progress !== null) {
    return (
      <span className="flex items-center gap-2">
        {t("readingProgress", { progress: reading.progress })}
        <span aria-hidden className="h-1.5 w-12 rounded-full bg-border">
          <span
            className="block h-1.5 rounded-full bg-accent"
            style={{ width: `${reading.progress}%` }}
          />
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {reading.status === "read" && (
        <Check
          aria-hidden
          size={16}
          strokeWidth={2.5}
          className="text-accent"
        />
      )}
      {t(`reading.${reading.status}`)}
    </span>
  );
}
