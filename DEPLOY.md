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

## Qwen place research

1. In the existing project's [Edge Function secrets](https://supabase.com/dashboard/project/iqpljuxtjngcisvokjkm/functions/secrets), save your Alibaba Cloud Model Studio key as `DASHSCOPE_API_KEY` (`QWEN_API_KEY` also works). This key remains in Supabase; never put it in GitHub files, the public config, or a browser field.
2. The function calls the Singapore (international) endpoint `https://dashscope-intl.aliyuncs.com`. Keys only work in the region that issued them. If your key is from the China (Beijing) region, also save `QWEN_BASE_URL` = `https://dashscope.aliyuncs.com`. Optional `QWEN_MODEL` overrides the default `qwen-plus`.
3. Create a Supabase personal access token with permission for this project at [account tokens](https://supabase.com/dashboard/account/tokens). Save it as `SUPABASE_ACCESS_TOKEN` in [repository Actions secrets](https://github.com/ragonic1-eng/ragonic1-eng.github.io/settings/secrets/actions). This is a deployment credential, separate from the Qwen key. Do not paste either key into chat.
4. Run/re-run **Deploy Qwen place research** in [GitHub Actions](https://github.com/ragonic1-eng/ragonic1-eng.github.io/actions/workflows/research.yml). It installs `supabase/research.sql` through the management API, deploys `research-place`, and checks key readiness. It does not retrieve or print the key.
5. Open a **private shared trip link**, then Add/Edit → Place → **Research with Qwen**. Enter a public venue name and city. Choose a researched result and save the activity. Map search and the bundled catalogue remain available independently.

The edge function uses the DashScope native text-generation API (not the OpenAI-compatible endpoint, which does not return search sources) with `enable_search`, `forced_search`, `enable_source` and the `max` search strategy, up to 3,000 output tokens per request. Qwen returns its answer as JSON; the function only accepts a venue whose source URL (or `ref_N` citation) matches a web search result Qwen actually returned, and drops booking links that don't. It requires the private trip capability, checked against the database, before calling Qwen. Gateway JWT verification is disabled because this app uses private trip capabilities rather than Supabase Auth; the function performs its own authorization. A public project key or Origin header alone does not authorize a paid lookup.

Private SQL counters enforce at most **10 uncached attempts per trip/day** and **20 for the project/day**, resetting at midnight UTC. Failed provider attempts count toward the limit; there is no automatic paid retry. Results cache for 24 hours, duplicate in-flight queries are rejected, and all requests have timeouts. Research passes only the query and selected area to Qwen, never the private trip key, whole itinerary, or other card descriptions. Missing evidence fails safely instead of inventing a confirmed address or booking link. Model answers still need user review.

`GET /functions/v1/research-place` reports key presence and the model, not proof that the key is valid or matches the region. Verify a real private-trip request before claiming the AI is live. Optional server secret `ALLOWED_ORIGIN` overrides the default GitHub Pages origin if the site moves.

Tests: `node --test tests/research-backend.mjs`, `python3 tests/research-ui.py` (local static server on port 8000), and `node tests/research-database.mjs` after installing `@electric-sql/pglite` under `/tmp/orbit-research-db-test`. The backend tests use mocked Qwen responses; they do not prove the live API's response format.
