import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Field } from "../../components/ui/field";
import { api, unwrap } from "../../lib/api";
import { instanceQuery, sessionQuery } from "../../lib/session";
import { useErrorMessage } from "../../lib/use-error-message";
import { AuthForm, authInputClass } from "./auth-form";

export function SetupPage() {
  const { t } = useTranslation(["auth", "common"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();

  const setup = useMutation({
    mutationFn: (json: { name: string; email: string; password: string }) =>
      unwrap(api.setup.$post({ json })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: instanceQuery.queryKey });
      queryClient.removeQueries({ queryKey: sessionQuery.queryKey });
      await navigate({ to: "/library" });
    },
  });

  return (
    <AuthForm
      title={t("setup.title")}
      intro={t("setup.intro")}
      submitLabel={t("setup.submit")}
      pending={setup.isPending}
      error={setup.error ? errorMessage(setup.error) : undefined}
      onSubmit={(data) =>
        setup.mutate({
          name: String(data.get("name")),
          email: String(data.get("email")),
          password: String(data.get("password")),
        })
      }
    >
      <Field
        label={t("common:form.name")}
        name="name"
        autoComplete="name"
        required
        className={authInputClass}
      />
      <Field
        label={t("common:form.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        className={authInputClass}
      />
      <Field
        label={t("common:form.password")}
        hint={t("common:form.passwordHint")}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        className={authInputClass}
      />
    </AuthForm>
  );
}
