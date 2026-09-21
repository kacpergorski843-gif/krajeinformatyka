// @lovable.dev/vite-tanstack-config already includes the core TanStack/React/Tailwind
// plugins. We add the Cloudflare Workers runtime only during dev so bindings
// such as env.AI are available in the local Worker runtime as well.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { cloudflare } from "@cloudflare/vite-plugin";

const isDev = process.env.NODE_ENV === "development";

export default defineConfig({
  ...(isDev
    ? {
        plugins: [cloudflare({ viteEnvironment: { name: "ssr" } })],
      }
    : {}),
  tanstackStart: {
    server: { entry: "server" },
  },
});
