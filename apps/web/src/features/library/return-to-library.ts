import { useRouter } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import type { LibraryFilters } from "./search";

// The Library remembers how it was left so the book page can lead back to it.
// Going back in history (rather than pushing a new entry) also restores the
// scroll position and the pages already loaded.
let lastFilters: LibraryFilters = {};
let openedFromLibrary = false;

export function rememberLibrary(filters: LibraryFilters) {
  lastFilters = filters;
}

export function markOpenedFromLibrary() {
  openedFromLibrary = true;
}

export function forgetOpenedBook() {
  openedFromLibrary = false;
}

/** Props for a link back to the Library. */
export function useReturnToLibrary() {
  const router = useRouter();
  return {
    to: "/library" as const,
    search: lastFilters,
    onClick: (event: MouseEvent) => {
      if (!openedFromLibrary) return;
      event.preventDefault();
      router.history.back();
    },
  };
}
