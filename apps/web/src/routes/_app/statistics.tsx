import { createFileRoute } from "@tanstack/react-router";
import { StatisticsPage } from "../../features/statistics/statistics-page";

export const Route = createFileRoute("/_app/statistics")({
  component: StatisticsPage,
});
