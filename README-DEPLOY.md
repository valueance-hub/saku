# SAKU Journal — deploy via GitHub + Vercel

Your Vercel project is connected to GitHub, so **deploying = pushing these files to your repo.**
Vercel rebuilds automatically on every commit. Plain static files, no build step.

Your Supabase Project URL is **already filled in** (`https://xutmstycxicvpvrtslwb.supabase.co`)
and the publishable key is set. So once you push + run the SQL, login and cloud sync are live.

## Upload to your GitHub repo (root)
    index.html              <- the login (loads at sakujournal.com)
    dashboard.html          <- the dashboard
    support.js              <- runtime (leave as-is)
    uploads/saku-hero.jpg   <- login background
    supabase_schema.sql     <- run once in Supabase (reference only, not served)

GitHub web UI: Add file -> Upload files -> drop them in -> Commit. Vercel deploys automatically.

## 3 things to finish
1. **Rotate your Supabase secret key** (Settings -> API keys). It was shared in chat; the app never
   uses it — only the publishable key, which is safe in the browser.
2. **Run `supabase_schema.sql`** in Supabase -> SQL Editor (creates the `journals` table + row security).
   Until this runs, login still works but trades won't save to the cloud (they cache in the browser).
3. **Auth settings** — Authentication -> URL Configuration: Site URL = `https://sakujournal.com`
   (add it to Redirect URLs too). Optional: Providers -> Email -> "Confirm email" OFF for instant login
   (otherwise new signups must click an email link before they can enter).

## Domain
Vercel -> project -> Settings -> Domains -> add `sakujournal.com`, then add the DNS records it shows.

> If `xutmstycxicvpvrtslwb` isn't your real Supabase project ref, just change the
> `window.SAKU_SUPABASE_URL` line in both files.
