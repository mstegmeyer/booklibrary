import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "../features/auth/login-page";
import { instanceQuery, sessionQuery } from "../lib/session";

export const Route = createFileRoute("/login")({
  beforeLoad: async ({ context: { queryClient } }) => {
    const instance = await queryClient.ensureQueryData(instanceQuery);
    if (instance.setupRequired) throw redirect({ to: "/setup" });
    if (await queryClient.ensureQueryData(sessionQuery)) {
      throw redirect({ to: "/library" });
    }
  },
  component: LoginPage,
});
