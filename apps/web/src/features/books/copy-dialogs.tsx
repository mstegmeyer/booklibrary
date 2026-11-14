import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { SelectField } from "../../components/ui/select";
import { api, unwrap } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { LocationSelect } from "../locations/location-select";
import { type BookDetail, type CopyDetail, refreshCatalogue } from "./queries";

const formats = ["paperback", "hardcover", "other"] as const;

function useCopyDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  return {
    open,
    setOpen,
    done: async () => {
      await refreshCatalogue(queryClient);
      setOpen(false);
    },
  };
}

export function AddCopyDialog({
  book,
  trigger,
}: {
  book: BookDetail;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["books", "common"]);
  const errorMessage = useErrorMessage();
  const dialog = useCopyDialog();
  const [locationId, setLocationId] = useState("");
  const [format, setFormat] = useState("");
  const add = useMutation({
    mutationFn: () =>
      unwrap(
        api.books[":id"].copies.$post({
          param: { id: book.id },
          json: {
            locationId: locationId || null,
            format: formats.find((f) => f === format) ?? null,
          },
        }),
      ),
    onSuccess: dialog.done,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("copies.addTitle")}
        closeLabel={t("common:form.cancel")}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <LocationSelect
            label={t("copies.location")}
            noneLabel={t("copies.noLocation")}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          />
          <SelectField
            label={t("copies.format")}
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value="">{t("copies.unknownFormat")}</option>
            {formats.map((f) => (
              <option key={f} value={f}>
                {t(`copies.formats.${f}`)}
              </option>
            ))}
          </SelectField>
          <FormError>
            {add.error ? errorMessage(add.error) : undefined}
          </FormError>
          <Button type="submit" disabled={add.isPending} className="self-start">
            {t("copies.addSubmit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoveCopyDialog({
  book,
  copy,
  trigger,
}: {
  book: BookDetail;
  copy: CopyDetail;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["books", "common"]);
  const errorMessage = useErrorMessage();
  const dialog = useCopyDialog();
  const [locationId, setLocationId] = useState(copy.location?.id ?? "");
  const move = useMutation({
    mutationFn: () =>
      unwrap(
        api.books[":id"].copies[":copyId"].$patch({
          param: { id: book.id, copyId: copy.id },
          json: { locationId: locationId || null },
        }),
      ),
    onSuccess: dialog.done,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    move.mutate();
  };

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("copies.moveTitle")}
        closeLabel={t("common:form.cancel")}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <LocationSelect
            label={t("copies.location")}
            noneLabel={t("copies.noLocation")}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          />
          <FormError>
            {move.error ? errorMessage(move.error) : undefined}
          </FormError>
          <Button
            type="submit"
            disabled={move.isPending}
            className="self-start"
          >
            {t("copies.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveCopyDialog({
  book,
  copy,
  trigger,
}: {
  book: BookDetail;
  copy: CopyDetail;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["books", "common"]);
  const errorMessage = useErrorMessage();
  const dialog = useCopyDialog();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () =>
      unwrap(
        api.books[":id"].copies[":copyId"].$delete({
          param: { id: book.id, copyId: copy.id },
        }),
      ),
    onSuccess: async ({ bookKept }) => {
      if (!bookKept) await navigate({ to: "/library", replace: true });
      await dialog.done();
    },
  });

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("copies.removeTitle")}
        closeLabel={t("common:form.cancel")}
      >
        <p className="text-sm">
          {book.copies.length === 1
            ? t("copies.removeLast")
            : t("copies.removeOne")}
        </p>
        <FormError>
          {remove.error ? errorMessage(remove.error) : undefined}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t("copies.removeSubmit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
