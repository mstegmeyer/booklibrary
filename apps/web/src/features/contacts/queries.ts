import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";

const fetchContacts = async () => (await unwrap(api.contacts.$get())).items;

/** Everyone, by name, with their active loan counts. */
export const contactsQuery = queryOptions({
  queryKey: ["contacts"],
  queryFn: fetchContacts,
});

export type Contact = Awaited<ReturnType<typeof fetchContacts>>[number];

/** An existing person by id, or a new person by name, as the API takes it. */
export type ContactChoice = { id: string } | { name: string };
