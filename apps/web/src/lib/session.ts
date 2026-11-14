import { queryOptions } from "@tanstack/react-query";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { api, unwrap } from "./api";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient()],
});

export const instanceQuery = queryOptions({
  queryKey: ["instance"],
  queryFn: () => unwrap(api.instance.$get()),
  staleTime: Number.POSITIVE_INFINITY,
});

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async () => (await authClient.getSession()).data ?? null,
  staleTime: 60_000,
});
