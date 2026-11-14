import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { ApiError } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { refreshCatalogue, updateFromCatalogue } from "./queries";

/**
 * "Update from the catalogue", after a confirmation: it replaces what people
 * may have corrected by hand.
 */
export function UpdateFromCatalogueDialog({
  bookId,
  trigger,
}: {
  bookId: string;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["books", "common"]);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const update = useMutation({
    mutationFn: () => updateFromCatalogue(bookId),
    onSuccess: async () => {
      await Promise.all([
        refreshCatalogue(queryClient),
        queryClient.invalidateQueries({ queryKey: ["statistics"] }),
      ]);
      setOpen(false);
    },
  });
  const code = update.error instanceof ApiError ? update.error.code : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        update.reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("update.title")}
        closeLabel={t("common:form.cancel")}
      >
        <p className="text-sm">{t("update.text")}</p>
        <FormError>
          {update.error &&
            (code === "metadata_not_found"
              ? t("update.notFound")
              : code === "metadata_unavailable"
                ? t("lookup.unavailable")
                : errorMessage(update.error))}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button disabled={update.isPending} onClick={() => update.mutate()}>
            {t("update.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
