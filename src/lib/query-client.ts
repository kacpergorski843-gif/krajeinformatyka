import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query configuration.
 *
 * Keep data synchronized across active sessions. This polling fallback also
 * refreshes derived views (such as country_stats) that cannot emit their own
 * Supabase Realtime change events.
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        refetchInterval: 60_000,
        refetchIntervalInBackground: true,
        retry: 1,
      },
    },
  });
}
