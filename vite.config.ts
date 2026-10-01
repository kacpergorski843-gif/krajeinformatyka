import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://kbcofzdboyzgsquvtzfq.supabase.co";
const supabasePublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_7_r097eJVu-A2-HUG8GAQg_Mjd83qW4";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: { define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL ?? supabaseUrl ?? "",
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? supabasePublishableKey ?? "",
    ),
  } },
});
