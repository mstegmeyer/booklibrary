import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";

const fetchLocations = async () => (await unwrap(api.locations.$get())).items;

/** Every location in tree order, parents before their children. */
export const locationsQuery = queryOptions({
  queryKey: ["locations"],
  queryFn: fetchLocations,
});

export type LocationNode = Awaited<ReturnType<typeof fetchLocations>>[number];

export const formatPath = (path: string[]) => path.join(" › ");
