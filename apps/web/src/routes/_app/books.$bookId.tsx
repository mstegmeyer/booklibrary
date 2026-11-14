import { createFileRoute } from "@tanstack/react-router";
import { BookPage } from "../../features/books/book-page";

export const Route = createFileRoute("/_app/books/$bookId")({
  component: BookPage,
});
