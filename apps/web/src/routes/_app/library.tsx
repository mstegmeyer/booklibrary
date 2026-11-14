import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "../../features/library/library-page";
import { parseLibrarySearch } from "../../features/library/search";

export const Route = createFileRoute("/_app/library")({
  validateSearch: parseLibrarySearch,
  component: LibraryPage,
});
