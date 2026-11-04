import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query configuration.
 *
 * Queries should opt into polling only when they need live updates.
 * Keep the shared cache lifetime and retry behavior stable.
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchInterval: 10_000,
        refetchIntervalInBackground: false,
        retry: 1,
      },
    },
  });
}
