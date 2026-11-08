import { createFileRoute } from "@tanstack/react-router";

import { APP_BUILD_ID } from "@/lib/app-version";

export const Route = createFileRoute("/api/app-version")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ version: APP_BUILD_ID }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            pragma: "no-cache",
            expires: "0",
          },
        }),
    },
  },
});
