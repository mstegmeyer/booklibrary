import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
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
import { sheet } from "./progress-dialog";
import { refreshReading, todayIso } from "./queries";

/** Changes the finish date of a book already read, or forgets it. */
export function FinishDateDialog({
  bookId,
  endedOn,
  trigger,
}: {
  bookId: string;
  endedOn: string | null;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["reading", "common"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [unknown, setUnknown] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.reading.books[":bookId"].finish.$post({
          param: { bookId },
          json: { date: unknown ? null : date },
        }),
      ),
    onSuccess: async () => {
      await refreshReading(queryClient);
      setOpen(false);
    },
  });

  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setDate(endedOn ?? todayIso());
    setUnknown(endedOn === null);
    save.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("finishDate.title")}
        closeLabel={t("common:form.cancel")}
        className={sheet}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label={t("finishDate.date")}
            type="date"
            required={!unknown}
            disabled={unknown}
            value={unknown ? "" : date}
            onChange={(event) => setDate(event.target.value)}
          />
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={unknown}
              onChange={(event) => setUnknown(event.target.checked)}
              className="size-4 accent-accent"
            />
            {t("finishDate.unknown")}
          </label>
          <FormError>
            {save.error ? errorMessage(save.error) : undefined}
          </FormError>
          <Button
            type="submit"
            disabled={save.isPending}
            className="self-start"
          >
            {t("common:form.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
