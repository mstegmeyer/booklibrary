import { infiniteQueryOptions } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";

export const usersQuery = infiniteQueryOptions({
  queryKey: ["users"],
  queryFn: ({ pageParam }) =>
    unwrap(api.users.$get({ query: { cursor: pageParam } })),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
