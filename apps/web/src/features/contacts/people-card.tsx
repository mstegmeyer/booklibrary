import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Dialog, DialogClose, DialogContent } from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Field, FormError } from "../../components/ui/field";
import { ApiError, api, unwrap } from "../../lib/api";
import { useErrorMessage } from "../../lib/use-error-message";
import { type Contact, contactsQuery } from "./queries";

/** The "People" card of the Loans page. */
export function PeopleCard() {
  const { t } = useTranslation("contacts");
  const { data: contacts } = useQuery(contactsQuery);
  const [adding, setAdding] = useState(false);

  return (
    <section
      aria-labelledby="people-title"
      className="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5 rounded-xl border border-border bg-surface p-5"
    >
      <h2
        id="people-title"
        className="font-semibold text-ink-muted text-xs uppercase leading-4 tracking-[0.06em]"
      >
        {t("title")}
      </h2>
      {contacts?.length === 0 && (
        <p className="text-ink-muted text-sm">{t("none")}</p>
      )}
      {contacts && contacts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {contacts.map((contact) => (
            <Person key={contact.id} contact={contact} />
          ))}
        </ul>
      )}
      <p className="text-[13px] text-ink-muted leading-5">{t("explain")}</p>
      <Button
        variant="secondary"
        className="h-11 self-start rounded-[10px] px-3.5 md:h-9 md:rounded-lg"
        onClick={() => setAdding(true)}
      >
        {t("add")}
      </Button>
      <NameDialog
        title={t("add")}
        submit={t("addSubmit")}
        open={adding}
        onOpenChange={setAdding}
        save={(name) => unwrap(api.contacts.$post({ json: { name } }))}
      />
    </section>
  );
}

function Person({ contact }: { contact: Contact }) {
  const { t } = useTranslation("contacts");
  const [dialog, setDialog] = useState<"rename" | "delete">();
  const onOpenChange = (open: boolean) => {
    if (!open) setDialog(undefined);
  };
  const lentYou = { count: contact.borrowed };
  const summary =
    contact.lent > 0
      ? [
          t("has", { count: contact.lent }),
          contact.borrowed > 0 && t("lentYou", lentYou),
        ]
          .filter(Boolean)
          .join(" · ")
      : contact.borrowed > 0
        ? t("onlyLentYou", lentYou)
        : t("noLoans");

  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e6e9e3] font-semibold text-sm"
      >
        {contact.name.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-sm leading-5">
          {contact.name}
        </span>
        <span className="text-[13px] text-ink-muted leading-[18px]">
          {summary}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("menu", { name: contact.name })}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-sidebar hover:text-ink md:size-9"
        >
          <MoreHorizontal aria-hidden size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("delete")}>
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NameDialog
        title={t("renameTitle", { name: contact.name })}
        submit={t("save")}
        initial={contact.name}
        open={dialog === "rename"}
        onOpenChange={onOpenChange}
        save={(name) =>
          unwrap(
            api.contacts[":id"].$patch({
              param: { id: contact.id },
              json: { name },
            }),
          )
        }
      />
      <DeleteDialog
        contact={contact}
        open={dialog === "delete"}
        onOpenChange={onOpenChange}
      />
    </li>
  );
}

function NameDialog({
  title,
  open,
  onOpenChange,
  ...form
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & Omit<NameFormProps, "onDone">) {
  const { t } = useTranslation("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} closeLabel={t("form.cancel")}>
        {open && <NameForm {...form} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type NameFormProps = {
  submit: string;
  initial?: string;
  save: (name: string) => Promise<unknown>;
  onDone: () => void;
};

function NameForm({ submit, initial = "", save, onDone }: NameFormProps) {
  const { t } = useTranslation("contacts");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial);
  const mutation = useMutation({
    mutationFn: () => save(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
      await queryClient.invalidateQueries({ queryKey: contactsQuery.queryKey });
      onDone();
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label={t("name")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={100}
        autoComplete="off"
        required
      />
      <FormError>
        {mutation.error ? errorMessage(mutation.error) : undefined}
      </FormError>
      <Button
        type="submit"
        disabled={mutation.isPending || !name.trim()}
        className="self-start"
      >
        {submit}
      </Button>
    </form>
  );
}

function DeleteDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["contacts", "common"]);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.contacts[":id"].$delete({ param: { id: contact.id } })),
    onSuccess: async () => {
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: contactsQuery.queryKey });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        remove.reset();
      }}
    >
      <DialogContent
        title={t("deleteTitle", { name: contact.name })}
        closeLabel={t("common:form.cancel")}
      >
        <p className="text-sm">{t("deleteText")}</p>
        <FormError>
          {remove.error &&
            (remove.error instanceof ApiError &&
            remove.error.code === "conflict"
              ? t("inUse", { name: contact.name })
              : errorMessage(remove.error))}
        </FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t("common:form.cancel")}</Button>
          </DialogClose>
          <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t("delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
