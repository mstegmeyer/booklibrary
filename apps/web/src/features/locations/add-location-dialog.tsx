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
import { type LocationNode, locationsQuery } from "./queries";

export function AddLocationDialog({
  parent,
  trigger,
  onCreated,
}: {
  parent?: LocationNode;
  trigger: ReactNode;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation(["locations", "common"]);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();

  const create = useMutation({
    mutationFn: (name: string) =>
      unwrap(api.locations.$post({ json: { name, parentId: parent?.id } })),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: locationsQuery.queryKey,
      });
      setOpen(false);
      onCreated(created.id);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(String(new FormData(event.currentTarget).get("name")));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        create.reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={
          parent ? t("addInsideTitle", { name: parent.name }) : t("addTitle")
        }
        closeLabel={t("common:form.cancel")}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label={t("name")}
            name="name"
            autoComplete="off"
            maxLength={100}
            required
          />
          <FormError>
            {create.error ? errorMessage(create.error) : undefined}
          </FormError>
          <Button
            type="submit"
            disabled={create.isPending}
            className="self-start"
          >
            {t("addSubmit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
