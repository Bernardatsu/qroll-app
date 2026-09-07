# QRoll — deploying and running from the repository

Everything the app needs is inside this repository: source code, all images and
videos (`src/assets/`), the PDF manual, icons and manifest (`public/`), and the
full database schema (`supabase/migrations/`).

## 1. Run locally

```bash
bun install      # or npm install
cp .env.example .env   # fill in your backend values
bun run dev
```

Open http://localhost:8080

## 2. Environment variables

No `.env` file is required to run the app: the public backend URL and
publishable key are committed in `src/config/public-backend.ts` and used
automatically when the environment variables are absent, so `bun install && bun run dev`
works straight after cloning. Set the `VITE_*` variables in `.env` only to point
the app at a different backend — they always override the committed defaults.
See `.env.example`. The `VITE_*` values are public and required at build time.
`SUPABASE_SERVICE_ROLE_KEY` and `PAYSTACK_SECRET_KEY` are server-only — add them
as encrypted environment variables in your host, never in the repo.

## 3. Database

Apply every file in `supabase/migrations/` in filename order to a Supabase
project (Supabase CLI: `supabase db push`). They create all tables, row-level
security policies, grants and functions (attendance, portal, student login,
semesters/archive).

## 4. Deploying to Vercel

1. Import the GitHub repository in Vercel.
2. Framework preset: **Other**. Build command `npm run build`, output is handled
   by the Nitro build.
3. Add a project environment variable `NITRO_PRESET=vercel` so the server build
   targets Vercel functions instead of the default Cloudflare target.
4. Add all variables from `.env.example` (real values) in Vercel → Settings →
   Environment Variables.
5. Deploy. The Paystack webhook URL becomes
   `https://<your-domain>/api/public/webhooks/paystack`.

## 5. Assets

Media is imported directly from `src/assets/` (e.g.
`import logo from "@/assets/qroll-logo.png"`), so it is bundled and fingerprinted
at build time — no external asset host is involved.
