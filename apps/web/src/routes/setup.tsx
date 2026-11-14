import { createFileRoute, redirect } from "@tanstack/react-router";
import { SetupPage } from "../features/auth/setup-page";
import { instanceQuery } from "../lib/session";

export const Route = createFileRoute("/setup")({
  beforeLoad: async ({ context: { queryClient } }) => {
    const instance = await queryClient.ensureQueryData(instanceQuery);
    if (!instance.setupRequired) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});
