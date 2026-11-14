import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import { FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { usersQuery } from "./queries";

type User = { id: string; name: string; role: "admin" | "member" };

function ConfirmDialog({
  trigger,
  title,
  text,
  confirmLabel,
  action,
}: {
  trigger: string;
  title: string;
  text: string;
  confirmLabel: string;
  action: () => Promise<unknown>;
}) {
  const { t } = useTranslation(["users", "common"]);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const confirm = useMutation({
    mutationFn: action,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        confirm.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">{trigger}</Button>
      </DialogTrigger>
      <DialogContent title={title} closeLabel={t("common:form.cancel")}>
        <p className="text-sm">{text}</p>
        <FormError>
          {confirm.error &&
            (confirm.error instanceof ApiError &&
            confirm.error.code === "conflict"
              ? t("lastAdmin")
              : errorMessage(confirm.error))}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoleDialog({ user }: { user: User }) {
  const { t } = useTranslation("users");
  const role = user.role === "admin" ? "member" : "admin";
  const key = role === "admin" ? "makeAdmin" : "removeAdmin";
  return (
    <ConfirmDialog
      trigger={t(key)}
      title={t(`${key}Title`, { name: user.name })}
      text={t(`${key}Text`, { name: user.name })}
      confirmLabel={t(key)}
      action={() =>
        unwrap(
          api.users[":id"].role.$put({
            param: { id: user.id },
            json: { role },
          }),
        )
      }
    />
  );
}

export function RemoveUserDialog({ user }: { user: User }) {
  const { t } = useTranslation("users");
  return (
    <ConfirmDialog
      trigger={t("remove")}
      title={t("removeTitle", { name: user.name })}
      text={t("removeText", { name: user.name })}
      confirmLabel={t("removeSubmit")}
      action={() =>
        unwrap(api.users[":id"].$delete({ param: { id: user.id } }))
      }
    />
  );
}
