// Public (safe-to-ship) backend connection values.
// These are the same values a browser would receive anyway: the project URL and
// the publishable/anon key. They are committed so the repository runs from a
// plain `git clone` (Google AI Studio, another IDE, a fresh Vercel import)
// without anyone having to create a .env file first.
// Any real secret (service role key, Paystack secret) stays out of the repo.
export const PUBLIC_SUPABASE_URL = "https://pubetvgzfnuxmuapclwm.supabase.co";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1YmV0dmd6Zm51eG11YXBjbHdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTg0NzUsImV4cCI6MjA5Nzk3NDQ3NX0.HHH1aXk8wBQKQOwpmPZW5A5rPrP58Q2VnzeGhKD2YOE";
export const PUBLIC_SUPABASE_PROJECT_ID = "pubetvgzfnuxmuapclwm";
