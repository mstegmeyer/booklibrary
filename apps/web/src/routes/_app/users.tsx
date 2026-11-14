import { createFileRoute, redirect } from "@tanstack/react-router";
import { UsersPage } from "../../features/users/users-page";

export const Route = createFileRoute("/_app/users")({
  beforeLoad: ({ context: { user } }) => {
    if (user.role !== "admin") throw redirect({ to: "/library" });
  },
  component: UsersPage,
});
