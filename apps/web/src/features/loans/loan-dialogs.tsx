import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Field, FormError } from "../../components/ui/field";
import { api, unwrap } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { PersonPicker, useChosenName } from "../contacts/person-picker";
import type { ContactChoice } from "../contacts/queries";
import { type Loan, refreshLoans, today } from "./queries";

/**
 * "Mark returned": asks for the day the book came back, today by default.
 * `loanId` may be looked up only when the user confirms.
 */
export function ReturnDialog({
  loanId,
  startedOn,
  trigger,
}: {
  loanId: () => Promise<string>;
  startedOn: string;
  trigger: ReactNode;
}) {
  const { t } = useTranslation(["loans", "common"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [endedOn, setEndedOn] = useState(today);

  const markReturned = useMutation({
    mutationFn: async () =>
      unwrap(
        api.loans[":id"].return.$post({
          param: { id: await loanId() },
          json: { endedOn },
        }),
      ),
    onSuccess: async () => {
      await refreshLoans(queryClient);
      setOpen(false);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    markReturned.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setEndedOn(today());
        markReturned.reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t("return.title")}
        closeLabel={t("common:form.cancel")}
        layout="sheet"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label={t("return.returnedOn")}
            type="date"
            value={endedOn}
            min={startedOn}
            onChange={(event) => setEndedOn(event.target.value)}
            required
          />
          <FormError>
            {markReturned.error ? errorMessage(markReturned.error) : undefined}
          </FormError>
          <Button
            type="submit"
            disabled={markReturned.isPending}
            className="self-start"
          >
            {t("markReturned")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A loan row's menu for corrections: edit or delete the loan. */
export function LoanMenu({ loan }: { loan: Loan }) {
  const { t } = useTranslation("loans");
  const [dialog, setDialog] = useState<"edit" | "delete">();
  const onOpenChange = (open: boolean) => {
    if (!open) setDialog(undefined);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("menu.label", { title: loan.book.title })}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-sidebar hover:text-ink md:size-9"
        >
          <MoreHorizontal aria-hidden size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            {t("menu.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("delete")}>
            {t("menu.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditLoanDialog
        loan={loan}
        open={dialog === "edit"}
        onOpenChange={onOpenChange}
      />
      <DeleteLoanDialog
        loan={loan}
        open={dialog === "delete"}
        onOpenChange={onOpenChange}
      />
    </>
  );
}

type DialogProps = {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditLoanDialog({ loan, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation(["loans", "common"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("edit.title")}
        closeLabel={t("common:form.cancel")}
        layout="sheet"
      >
        <p className="-mt-4 text-ink-muted text-sm">{loan.book.title}</p>
        {open && (
          <EditLoanForm loan={loan} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditLoanForm({ loan, onDone }: { loan: Loan; onDone: () => void }) {
  const { t } = useTranslation(["loans", "contacts"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [person, setPerson] = useState<ContactChoice>({ id: loan.contact.id });
  const [startedOn, setStartedOn] = useState(loan.startedOn);
  const [endedOn, setEndedOn] = useState(loan.endedOn ?? "");
  const [note, setNote] = useState(loan.note ?? "");
  const name = useChosenName(person);

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.loans[":id"].$patch({
          param: { id: loan.id },
          json: {
            contact: person,
            startedOn,
            endedOn: endedOn || undefined,
            note,
          },
        }),
      ),
    onSuccess: async () => {
      await refreshLoans(queryClient);
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name) save.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PersonPicker
        label={t("contacts:picker.label")}
        value={person}
        onChange={setPerson}
      />
      <Field
        label={t("edit.startedOn")}
        type="date"
        value={startedOn}
        max={endedOn || undefined}
        onChange={(event) => setStartedOn(event.target.value)}
        required
      />
      {loan.endedOn && (
        <Field
          label={t("edit.endedOn")}
          type="date"
          value={endedOn}
          min={startedOn}
          onChange={(event) => setEndedOn(event.target.value)}
          required
        />
      )}
      <Field
        label={t("edit.note")}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
      />
      <FormError>{save.error ? errorMessage(save.error) : undefined}</FormError>
      <Button
        type="submit"
        disabled={!name || save.isPending}
        className="self-start"
      >
        {t("edit.save")}
      </Button>
    </form>
  );
}

function DeleteLoanDialog({ loan, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation(["loans", "common"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.loans[":id"].$delete({ param: { id: loan.id } })),
    onSuccess: async () => {
      onOpenChange(false);
      await refreshLoans(queryClient);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("delete.title")}
        closeLabel={t("common:form.cancel")}
      >
        <p className="text-sm">
          <span className="font-semibold">{loan.book.title}</span> ·{" "}
          {loan.direction === "lent"
            ? t("lentToName", { name: loan.contact.name })
            : t("borrowedFromName", { name: loan.contact.name })}
        </p>
        <p className="text-sm">{t("delete.text")}</p>
        <FormError>
          {remove.error ? errorMessage(remove.error) : undefined}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t("delete.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
