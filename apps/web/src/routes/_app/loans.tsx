import { createFileRoute } from "@tanstack/react-router";
import { LoansPage } from "../../features/loans/loans-page";

export const Route = createFileRoute("/_app/loans")({
  component: LoansPage,
});
