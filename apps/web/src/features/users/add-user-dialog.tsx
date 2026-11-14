import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Field, FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { usersQuery } from "./queries";

export function AddUserDialog() {
  const { t } = useTranslation(["users", "common"]);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();

  const create = useMutation({
    mutationFn: (json: { name: string; email: string; password: string }) =>
      unwrap(api.users.$post({ json })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
      setOpen(false);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      name: String(data.get("name")),
      email: String(data.get("email")),
      password: String(data.get("password")),
    });
  };

  const error = create.error;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        create.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>{t("add")}</Button>
      </DialogTrigger>
      <DialogContent title={t("addTitle")} closeLabel={t("common:form.cancel")}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label={t("common:form.name")}
            name="name"
            autoComplete="off"
            required
          />
          <Field
            label={t("common:form.email")}
            name="email"
            type="email"
            autoComplete="off"
            required
          />
          <Field
            label={t("common:form.password")}
            hint={t("common:form.passwordHint")}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <FormError>
            {error &&
              (error instanceof ApiError && error.code === "conflict"
                ? t("emailTaken")
                : errorMessage(error))}
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
