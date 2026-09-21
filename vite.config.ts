// @lovable.dev/vite-tanstack-config already includes the core TanStack/React/Tailwind
// plugins. Cloudflare's Vite plugin must be active for both dev and build so the
// TanStack Start SSR server actually runs inside the Workers runtime and exposes
// bindings such as env.AI.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } })],
  tanstackStart: {
    server: { entry: "server" },
  },
});
