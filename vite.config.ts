// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_PROJECT_ID,
} from "./src/config/public-backend";

// Fallbacks so a plain clone of this repository (no .env file) still connects to
// the backend. Real .env values always win.
process.env["VITE_SUPABASE_URL"] ||= PUBLIC_SUPABASE_URL;
process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||= PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env["VITE_SUPABASE_PROJECT_ID"] ||= PUBLIC_SUPABASE_PROJECT_ID;
process.env["SUPABASE_URL"] ||= PUBLIC_SUPABASE_URL;
process.env["SUPABASE_PUBLISHABLE_KEY"] ||= PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env["SUPABASE_PROJECT_ID"] ||= PUBLIC_SUPABASE_PROJECT_ID;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        process.env["VITE_SUPABASE_URL"],
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        process.env["VITE_SUPABASE_PROJECT_ID"],
      ),
    },
  },
});
