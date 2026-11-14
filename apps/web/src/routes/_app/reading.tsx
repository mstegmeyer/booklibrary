import { createFileRoute } from "@tanstack/react-router";
import { ReadingPage } from "../../features/reading/reading-page";

export const Route = createFileRoute("/_app/reading")({
  component: ReadingPage,
});
