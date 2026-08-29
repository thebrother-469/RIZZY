import { createFileRoute } from "@tanstack/react-router";
import { handleHealthz } from "@/lib/healthz";

export const Route = createFileRoute("/api/healthz")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handleHealthz(request),
    },
  },
});
