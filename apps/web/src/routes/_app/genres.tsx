import { createFileRoute } from "@tanstack/react-router";
import { GenresPage } from "../../features/genres/genres-page";

export const Route = createFileRoute("/_app/genres")({
  component: GenresPage,
});
