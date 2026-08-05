import { QueryClient } from "@tanstack/react-query";

/**
 * Creates the single QueryClient owned by one TanStack Start router instance.
 * The router factory runs once in the browser and once per SSR request, which
 * prevents cached user data from leaking between server requests.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: 1,
      },
    },
  });
}
