import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../lib/format";
import { Card } from "./card";

/** A round axis maximum whose half, the middle grid line, is whole too. */
function axisTop(max: number) {
  for (let scale = 1; ; scale *= 10) {
    for (const n of [2, 4, 6, 8, 10, 12, 16]) {
      if (n * scale >= max) return n * scale;
    }
  }
}

const months = Array.from({ length: 12 }, (_, month) => new Date(2000, month));

/**
 * Thin bars per month. Only the highest months and the current one carry a
 * number; "View as table" shows all of them.
 */
export function MonthChart({
  title,
  unit,
  values,
  currentMonth,
}: {
  title: string;
  unit: string;
  values: number[];
  currentMonth: number | null;
}) {
  const { t, i18n } = useTranslation("statistics");
  const format = useFormat();
  const [asTable, setAsTable] = useState(false);
  const monthName = (style: "short" | "narrow" | "long") =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: style }).format;
  const max = Math.max(...values);
  const top = axisTop(max);
  const labelled = (value: number, month: number) =>
    value > 0 && (value === max || month === currentMonth);

  return (
    <Card
      title={title}
      action={
        <button
          type="button"
          onClick={() => setAsTable(!asTable)}
          className="h-8 cursor-pointer px-2 font-semibold text-[13px] text-accent hover:text-accent-hover"
        >
          {asTable ? t("charts.viewAsChart") : t("charts.viewAsTable")}
        </button>
      }
    >
      {asTable ? (
        <table aria-label={title} className="w-full text-sm leading-5">
          <thead>
            <tr className="text-ink-muted text-xs">
              <th scope="col" className="py-1.5 text-left font-semibold">
                {t("charts.month")}
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                {unit}
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((month, i) => (
              <tr key={month.getMonth()} className="border-border border-t">
                <td className="py-1.5">{monthName("long")(month)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {format.number(values[i] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div aria-hidden className="relative ml-8 md:ml-11">
          {[0, 50, 100].map((at) => (
            <div
              key={at}
              className="absolute inset-x-0"
              style={{ top: `${at}%` }}
            >
              <div
                className={at === 100 ? "h-px bg-control" : "h-px bg-border"}
              />
              <span className="absolute -top-2 -left-8 w-6 text-right text-[11px] text-ink-muted leading-4 md:-left-11 md:-top-[9px] md:w-9 md:text-xs md:leading-[18px]">
                {format.number((top * (100 - at)) / 100)}
              </span>
            </div>
          ))}
          <div className="relative flex h-[110px] md:h-[180px]">
            {values.map((value, i) => (
              <div
                key={months[i]?.getMonth()}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-[3px] md:gap-1"
              >
                {labelled(value, i) && (
                  <span className="whitespace-nowrap font-semibold text-[11px] text-ink leading-[14px] md:text-xs md:leading-4">
                    {format.number(value)}
                  </span>
                )}
                <div
                  className="w-3 shrink-0 rounded-t bg-accent md:w-5"
                  style={{ height: `${(value / top) * 100}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {!asTable && (
        <div aria-hidden className="-mt-2 ml-8 flex md:-mt-3 md:ml-11">
          {months.map((month) => (
            <span
              key={month.getMonth()}
              className="min-w-0 flex-1 text-center text-[11px] text-ink-muted leading-4 md:text-xs md:leading-[18px]"
            >
              <span className="md:hidden">{monthName("narrow")(month)}</span>
              <span className="max-md:hidden">{monthName("short")(month)}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
