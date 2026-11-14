import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/shell/page-header";
import { Button } from "../../components/ui/button";
import { Field, FormError } from "../../components/ui/field";
import { authClient, sessionQuery } from "../../lib/session";

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-semibold font-serif text-[22px] leading-7">
          {title}
        </h2>
        {intro && <p className="text-ink-muted text-sm">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function Saved({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-sm">
      {children}
    </p>
  );
}

function NameForm() {
  const { t } = useTranslation(["account", "common"]);
  const { data: session } = useSuspenseQuery(sessionQuery);
  const queryClient = useQueryClient();
  const rename = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await authClient.updateUser({ name });
      if (error) throw new Error(t("common:errors.generic"));
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey }),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    rename.mutate(name.trim());
  };

  return (
    <Section title={t("nameTitle")}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label={t("common:form.name")}
          name="name"
          autoComplete="name"
          defaultValue={session?.user.name}
          maxLength={100}
          pattern=".*\S.*"
          required
          onChange={() => rename.reset()}
        />
        <FormError>{rename.error?.message}</FormError>
        {rename.isSuccess && <Saved>{t("nameSaved")}</Saved>}
        <Button
          type="submit"
          disabled={rename.isPending}
          className="self-start"
        >
          {t("common:form.save")}
        </Button>
      </form>
    </Section>
  );
}

function PasswordForm() {
  const { t } = useTranslation(["account", "common"]);
  const change = useMutation({
    mutationFn: async (input: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const { error } = await authClient.changePassword(input);
      if (error) {
        throw new Error(
          error.code === "INVALID_PASSWORD"
            ? t("wrongPassword")
            : t("common:errors.generic"),
        );
      }
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    change.mutate(
      {
        currentPassword: String(data.get("currentPassword")),
        newPassword: String(data.get("newPassword")),
      },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <Section title={t("passwordTitle")} intro={t("passwordIntro")}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label={t("currentPassword")}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <Field
          label={t("newPassword")}
          hint={t("common:form.passwordHint")}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
        <FormError>{change.error?.message}</FormError>
        {change.isSuccess && <Saved>{t("passwordSaved")}</Saved>}
        <Button
          type="submit"
          disabled={change.isPending}
          className="self-start"
        >
          {t("common:form.save")}
        </Button>
      </form>
    </Section>
  );
}

export function AccountPage() {
  const { t } = useTranslation("account");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="flex max-w-[480px] flex-col gap-6">
        <NameForm />
        <PasswordForm />
      </div>
    </>
  );
}
