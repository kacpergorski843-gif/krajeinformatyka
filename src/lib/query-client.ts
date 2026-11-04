import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query configuration.
 *
 * Keep these defaults behavior-compatible: several screens rely on the
 * existing polling cadence and cache lifetime.
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
        retry: 1,
      },
    },
  });
}
