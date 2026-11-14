import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
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

export function ResetPasswordDialog({
  user,
}: {
  user: { id: string; name: string };
}) {
  const { t } = useTranslation(["users", "common"]);
  const [open, setOpen] = useState(false);
  const errorMessage = useErrorMessage();

  const reset = useMutation({
    mutationFn: (password: string) =>
      unwrap(
        api.users[":id"].password.$post({
          param: { id: user.id },
          json: { password },
        }),
      ),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    reset.mutate(String(new FormData(event.currentTarget).get("password")));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        reset.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">{t("resetPassword")}</Button>
      </DialogTrigger>
      <DialogContent
        title={t("resetTitle", { name: user.name })}
        closeLabel={t("common:form.cancel")}
      >
        {reset.isSuccess ? (
          <p role="status" className="text-sm">
            {t("resetDone", { name: user.name })}
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field
              label={t("newPassword")}
              hint={t("common:form.passwordHint")}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <FormError>
              {reset.error ? errorMessage(reset.error) : undefined}
            </FormError>
            <Button
              type="submit"
              disabled={reset.isPending}
              className="self-start"
            >
              {t("common:form.save")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
