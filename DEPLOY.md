# Free shared hosting: GitHub Pages + Supabase

GitHub Pages serves the planner; Supabase's free plan stores shared trips. This fits a small family itinerary within the services' free-plan limits. Free-tier project pauses, quotas, and plan terms are controlled by the providers.

1. In your Supabase project ([dashboard](https://supabase.com/dashboard/project/iqpljuxtjngcisvokjkm)), open **SQL Editor → New query**. Paste [supabase/setup.sql](supabase/setup.sql) and run it once. It creates a private trip table and three restricted functions. The website never receives database administrator credentials.
2. In `config.json`, set `provider` to `supabase`, `supabaseUrl` to your project URL, and `supabaseKey` to the **public publishable key**. A legacy public `anon` key also works. These public values belong in a browser app. Never use `service_role`, `sb_secret_`, a database password, or a private token here.
3. Push this repository to `main`. In GitHub repository **Settings → Pages**, select **GitHub Actions** as the source. The included Pages workflow deploys only public website assets. If Pages already deploys the root directly from `main`, that static deployment also works; choose a single deployment approach.
4. Open the deployed site. Click **Share trip → Create shared trip**, then copy the private edit link to your wife. Both of you should open that same link. The server saves edits and the other browser refreshes the plan roughly every three seconds.

The fragment in a private link is an editing capability. Anyone with the full link can read and change that particular trip. Don't post it publicly. Public project keys alone do not allow direct table reads, listing trips, or editing existing trips: the generated private trip key is required. Booking branches are reminders and links, not actual bookings.

## Conflicting edits

The database checks each save's revision. If two people edit at once, a stale save cannot replace newer work silently. The app retains the unsynced local draft and offers Export plus Load latest shared plan. Loading the latest snapshot also leaves a local recovery copy under `little-orbit-unsynced-backup`. Reapply needed changes from the exported draft after reviewing your partner's update.

## Local shared-server development

The optional dependency-free server uses SQLite:

```sh
python3 server.py
```

Use `config.json` with `provider: server`. It uses `.local-data/trips.sqlite3`; `DB_PATH` can select another persistent location and `PORT` selects the port. Back up this database for self hosting. Deploy behind HTTPS. A static `python3 -m http.server` serves the editor but cannot provide shared-server API endpoints.

## What must be verified before calling the site live

- Pages deployment finished successfully and the public URL serves the current build.
- Supabase SQL has been applied and the public configuration points to that project.
- Create a shared trip and open its private link in two independent browser contexts.
- Edit cards and branches in each context and confirm updates reach the other.
- Verify an incomplete/wrong key cannot load the trip and stale saves return a conflict.

The local SQLite backend is independently testable. Supabase deployment is a separate verification step, not established by a passing local test.
