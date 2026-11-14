import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Field, FormError } from "../../components/ui/field";
import { api, unwrap } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { ProgressBar } from "./progress-bar";
import { percent, refreshReading, todayIso } from "./queries";

/** At phone width the dialog is a sheet at the bottom of the screen. */
export const sheet =
  "max-md:top-auto max-md:bottom-0 max-md:max-h-[calc(100dvh-48px)] max-md:w-full max-md:max-w-none max-md:translate-y-0 max-md:rounded-b-none max-md:px-5 max-md:pb-[max(34px,env(safe-area-inset-bottom))]";

export function ProgressDialog({
  book,
  page,
  trigger,
}: {
  book: { id: string; title: string; pageCount: number | null };
  /** The page reached so far. */
  page: number | null;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["reading", "common"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const pageId = useId();
  const [open, setOpen] = useState(false);
  const [newPage, setNewPage] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [date, setDate] = useState(todayIso);

  const pageCount = book.pageCount ?? (Number(totalPages) || undefined);
  const save = useMutation({
    mutationFn: (finished: boolean) => {
      const param = { bookId: book.id };
      const added = book.pageCount ? undefined : pageCount;
      return unwrap(
        finished
          ? api.reading.books[":bookId"].finish.$post({
              param,
              json: { date, pageCount: added },
            })
          : api.reading.books[":bookId"].progress.$post({
              param,
              json: { date, page: Number(newPage), pageCount: added },
            }),
      );
    },
    onSuccess: async () => {
      await refreshReading(queryClient);
      setOpen(false);
    },
  });

  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setNewPage(page === null ? "" : String(page));
    setTotalPages("");
    setDate(todayIso());
    save.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(false);
  };

  const reached = Number(newPage);
  const since = reached - (page ?? 0);

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("progress.title")}
        closeLabel={t("common:form.cancel")}
        className={sheet}
      >
        <p className="-mt-4 text-ink-muted text-sm leading-5">{book.title}</p>
        <form onSubmit={submit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <label
              htmlFor={pageId}
              className="font-semibold text-[13px] leading-[18px]"
            >
              {t("progress.page")}
            </label>
            <div className="flex items-baseline gap-3">
              <input
                id={pageId}
                type="number"
                inputMode="numeric"
                required
                min={0}
                max={pageCount}
                value={newPage}
                onChange={(event) => setNewPage(event.target.value)}
                className="h-16 w-[132px] rounded-xl border border-control bg-surface px-3.5 font-semibold font-serif text-4xl text-ink tabular-nums"
              />
              {book.pageCount && (
                <span className="text-ink-muted text-lg leading-6">
                  {t("progress.of", { total: book.pageCount })}
                </span>
              )}
            </div>
          </div>
          {!book.pageCount && (
            <Field
              label={t("progress.totalPages")}
              hint={t("progress.totalPagesHint")}
              type="number"
              inputMode="numeric"
              min={Math.max(1, reached)}
              value={totalPages}
              onChange={(event) => setTotalPages(event.target.value)}
            />
          )}
          {pageCount && newPage !== "" && reached <= pageCount && (
            <div className="flex flex-col gap-2">
              <ProgressBar value={percent(reached, pageCount)} />
              <span className="text-ink-muted text-sm leading-5">
                {t("progress.percent", {
                  percent: percent(reached, pageCount),
                })}
                {page !== null &&
                  since > 0 &&
                  ` · ${t("progress.since", { count: since })}`}
              </span>
            </div>
          )}
          <Field
            label={t("progress.date")}
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <FormError>
            {save.error ? errorMessage(save.error) : undefined}
          </FormError>
          <div className="flex flex-col gap-2 md:flex-row-reverse md:justify-start">
            <Button
              type="submit"
              disabled={save.isPending}
              className="h-[50px] rounded-xl text-base md:h-10 md:rounded-lg md:text-sm"
            >
              {t("common:form.save")}
            </Button>
            <Button
              variant="secondary"
              disabled={save.isPending || !date}
              onClick={() => save.mutate(true)}
              className="h-12 rounded-xl text-base md:h-10 md:rounded-lg md:text-sm"
            >
              {t("progress.finished")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
