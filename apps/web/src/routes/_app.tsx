import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/shell/app-shell";
import { instanceQuery, sessionQuery } from "../lib/session";

/** Layout for every signed-in page. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context: { queryClient } }) => {
    const instance = await queryClient.ensureQueryData(instanceQuery);
    if (instance.setupRequired) throw redirect({ to: "/setup" });
    const session = await queryClient.ensureQueryData(sessionQuery);
    if (!session) throw redirect({ to: "/login" });
    return { user: session.user };
  },
  component: AppShell,
});
