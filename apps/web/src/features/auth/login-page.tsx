import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Field } from "../../components/ui/field";
import { authClient, sessionQuery } from "../../lib/session";
import { AuthForm, authInputClass } from "./auth-form";

export function LoginPage() {
  const { t } = useTranslation(["auth", "common"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signIn = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { error } = await authClient.signIn.email(credentials);
      if (error) {
        throw new Error(
          error.status === 401
            ? t("login.invalid")
            : t("common:errors.generic"),
        );
      }
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: sessionQuery.queryKey });
      await navigate({ to: "/library" });
    },
  });

  return (
    <AuthForm
      title={t("login.title")}
      intro={t("login.intro")}
      submitLabel={t("login.submit")}
      pending={signIn.isPending}
      error={signIn.error?.message}
      onSubmit={(data) =>
        signIn.mutate({
          email: String(data.get("email")),
          password: String(data.get("password")),
        })
      }
    >
      <Field
        label={t("common:form.email")}
        name="email"
        type="email"
        autoComplete="username"
        required
        className={authInputClass}
      />
      <Field
        label={t("common:form.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className={authInputClass}
      />
    </AuthForm>
  );
}
