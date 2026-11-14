import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";

export const membersQuery = queryOptions({
  queryKey: ["statistics", "members"],
  queryFn: () => unwrap(api.statistics.members.$get()),
});

/** Statistics of one user, or of the household when `userId` is missing. */
export const statisticsQuery = (userId: string | undefined, year: number) =>
  queryOptions({
    queryKey: ["statistics", userId ?? "household", year],
    queryFn: () =>
      unwrap(api.statistics.$get({ query: { userId, year: String(year) } })),
  });
