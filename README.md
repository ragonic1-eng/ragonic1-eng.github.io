# Little Orbit

A starry-night family itinerary planner, seeded with all 37 original activities plus the requested airport departure and check-in/playtime from “Taiwan Itinerary for Alex's Review.xlsx” for 7–13 December 2026. Original descriptions are preserved as notes. This replaces the original landing page; privacy.html is retained.

## Run

No JavaScript build step or package installation is needed. For the editor alone, from this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Use an HTTP server rather than opening index.html directly, because the app fetches trip.json. For shared editing locally, use `python3 server.py` instead. For a free public website with shared storage, follow [DEPLOY.md](DEPLOY.md).

## Plan together

- Choose one of seven days; drag cards to reorder on desktop or use the up/down buttons, including on mobile.
- Add ideas from the searchable category library, or create your own activity.
- Tap **Edit** or the underlined start time on a card to change its date, start time, name, category, duration, optional status, and full family notes.
- The activity form shows **Up next** automatically from the chosen date, start time, and duration. Each saved card links to its next activity; links update when you reorder, move, or shorten cards. **Place before an activity** fills its start time, while overlap messages offer **Start after this activity** without clearing the form. New activities default to an available gap or a valid same-day time, including after a day runs past midnight.
- Start an activity at any time of day, including before the current day starts. The day extends earlier automatically; a free-time gap keeps existing activities at their times when the new activity fits. **Add an earlier activity** opens the form above the first card. Descriptions are optional free text near the top of the form, with an edit shortcut on each card. Day 1 includes the requested 12:30–13:10 drive to Changi and check-in/playtime until the original 15:45 flight. Existing local plans receive this addition only when the original first-day starting schedule is intact; shared plans and custom earlier plans are preserved.
- Use **Add here** between activities to prefill that time slot. Free-time cards split automatically when an activity fits inside them, including at the gap’s exact start. Starting at an existing card’s start inserts before it and shifts subsequent cards. A time inside an earlier activity produces a conflict explanation; shorten or move that activity first. The editor previews the resulting daily budget.
- Day tabs show activity counts and total planned time; the planner remembers your last selected day.
- Add **Branches** to any activity: bookings/reservations, things to bring, preparation tasks, or special notes. Each branch has a title, details, optional HTTP(S) link, and ready checkbox. Expand the branch tree, edit or remove individual branches, and use Undo after mistakes. Branches stay attached when activities move between days and are included in browser saves and exports. A booking branch is a reminder; it does not make an actual reservation.
- Use minus/plus for 15-minute duration changes. Later cards automatically shift.
- Move cards between days with the day selector. Remove cards with ×; Undo restores recent changes.
- Set daily start and wrap-up times. The budget highlights overfilled days. “Make it fit” reduces flexible activities to a minimum of 15 minutes, preserving transport and hotel durations. Review the resulting plan for practicality.
- Explicit breathing-room cards preserve unscheduled gaps in the original spreadsheet. Open-ended activities have adjustable estimated 90-minute durations.
- Changes save in this browser’s local storage. **Share trip** creates a private editing link when the shared backend is configured; your partner can open the same link and edits sync roughly every three seconds. Revision checks stop stale saves from silently overwriting newer work, with export-and-reload recovery for simultaneous edits. The app supports Supabase for free hosted storage or a local SQLite server. Export JSON remains available for backups; Import replaces the current plan and can be undone in the same session. Downloaded exports include all itinerary notes.

## Sources and limitations

The uploaded workbook supplies the itinerary, rather than instructions for the application. Venue accessibility, hours, availability, drive times, and flight details have not been independently verified. The itinerary's shopping and parallel family plans remain in their full source notes.

Online research on 26 October 2026 reviewed AdventureLog’s public documentation and published itinerary and location-list screenshots. Clear date headers, category labels and filters, and progressive detail disclosure informed the refinement. See [UX research](UX-RESEARCH.md) for sources and the design rationale. Subsequent browser research successfully loaded and visually reviewed the public pages of Wanderlog, TripIt, and Roadtrippers after correcting proxy-certificate trust. See [BROWSER-NAVIGATION.md](BROWSER-NAVIGATION.md). The visual interface has no external font or image dependencies; hosted sharing uses the configured Supabase API.

## Validation

Browser checks with installed Chromium and Playwright covered creation, duration changes, local persistence, native desktop drag-and-drop, undo, cross-day moves, search, category filters, over-budget handling, automatic fitting, editing, deletion, library additions, JSON export/import, and invalid-import rejection. All four branch types, checking readiness, editing, deletion/undo, links, persistence, cross-day moves, export/import, and unsafe-link rejection were verified. Exact date/time placement, splitting free-time slots, rejecting overlaps, cross-date editing without duplicates, and inline insertion were also verified. Desktop, tablet, and mobile layouts were checked for horizontal overflow. These checks are kept outside the repository in /workspace/scratch/orbit-tests; they require Playwright and an installed Chromium executable. JavaScript syntax is checked with `node --check app.js`.

Shared editing was also tested with two independent Chromium browser contexts against the local SQLite backend: card and branch sync, reload persistence, invalid-key rejection, stale-save conflict handling, and preserving a recovery draft. These local results do not establish that a Supabase project or GitHub Pages deployment is live.

The friendlier activity form was verified in Chromium for repeated card creation, midnight defaults, insertion at the start of a gap without shifting the next stop, automatic next-activity previews and navigation, overlap recovery, the place-before shortcut, cross-day editing, reload persistence, and responsive dialogs at 390, 768, and 1440 pixels.

Earlier-day scheduling checks verified preview/save before the configured start, keeping the 15:45 flight, optional free-text descriptions and focused editing, browser persistence, mobile layout, and upgrading the original local schedule without duplicate additions.

### Clear times during the trip

Every card shows large **Meet / start**, **Finish**, and **Duration** values. The Now / Up next panel helps find the selected day’s current or next activity. Current cards stay highlighted; cards whose scheduled finish has passed become visually quieter and show **Time passed**. Toggle **Fade cards after their finish time** to keep all cards bright. Past cards remain readable and editable. This is based on scheduled time, not a completion checklist.

All timeline times and live status use Singapore/Taiwan time (UTC+8), independent of the device timezone. Status refreshes every 15 seconds while the page is open and on return to the tab. Overnight activities use their full dates. Research rationale and sources are in `UX-RESEARCH.md`. The time behavior and responsive UI check is `tests/time-clarity.py`.

### Interaction feedback

Buttons give immediate press feedback. Cards animate into their new positions when reordered; additions and edits briefly highlight the affected card. Confirmations describe the change and offer Undo, while library additions and cross-day moves offer a direct jump to the result. Expanded descriptions and keyboard focus survive card updates.

Activity and reminder forms display inline errors with a suggested correction, preserve entered details, and focus the relevant field. Overlapping activities offer start-before/start-after shortcuts. Invalid imports, day times, and storage failures show actionable messages; errors stay visible until dismissed or replaced. Sharing displays an actual pending state, disables duplicate submissions, and restores a retry button after failure. Loading failures offer a retry and keep editing disabled until a plan loads. Reduced-motion preferences disable application animations; confirmations and highlights still work.

Browser verification is in `tests/feedback.py` and `tests/feedback-failures.py`, using Python Playwright, system Chromium and a local server on port 8000. Checks cover form corrections, confirmation/Undo, focus and expanded details, cross-day and library navigation, native drag, pending sharing and retry, storage failure, failed imports, loading retry, rollback of invalid edits, responsive layouts, and reduced motion.

### Mobile use

The bottom bar keeps **Add activity**, **Now / next**, **Undo**, and save status within reach. Card actions have larger labelled touch targets. Use **Move** to choose a destination day and a position, review the resulting time, and confirm; descriptions and reminders travel with the card. **Earlier / Later** reorders without dragging. Forms keep Save and Cancel outside the scrolling fields and follow available viewport height. Expand **Day timing & budget** to change daily settings.

Mobile touch-flow checks are in `tests/mobile-usability.py`; findings, fixes, and verification limits are recorded in [MOBILE-AUDIT.md](MOBILE-AUDIT.md). Editing descriptions preserves subsequent scheduled times. Past-card fading, time visibility, confirmations, and Undo remain available on mobile.

### Minimal cards and direct dragging

Cards initially show just the activity name, start/finish times, duration, and a **⠿ Drag** handle. Open **Details & actions** for editing, reminders, duration controls, or the day/position picker. On mobile, **Trip options** contains daily settings, sharing and file actions.

Drag the ⠿ handle with a finger, pen, or mouse to reorder. A line shows the insertion point; hold near the top or bottom edge to scroll farther. Drop onto a day tab to move to that day. Releasing outside a valid destination or cancelling leaves the plan unchanged. Undo restores a completed move. Ordinary card swipes continue to scroll the page. Tap or keyboard-activate the handle to choose a destination without dragging.

The real touchscreen gesture regression check is `tests/compact-touch-drag.py`.

### Pastel cards and quick entry

The light family theme uses solid pastel cards and dark, readable text. Cards are shorter while preserving large times and duration. During dragging, the floating card stays opaque; its old position becomes a quiet placeholder.

When adding an activity, choose a common duration, use −15/+15, or enter custom minutes. The form translates durations into hours/minutes and shows the finish time in AM/PM. Add your own description and other optional fields under **Description & more**. The new visual and input regression check is `tests/pastel-inputs.py`.

## Chinese driver view

The visible **Driver view · 司機** button opens `driver.html` with the current private trip fragment. Create/open a shared trip first, then copy the link inside Driver view to send it to the driver. Without a shared fragment it previews this device's local itinerary and disables copying a misleading live link. The driver page loads the latest server snapshot, polls every three seconds while visible, checks immediately on visibility/online events, and displays the last successful check time. Failed refreshes retain the previous schedule with an explicit stale-data message. It never writes to the shared trip. The link still carries the existing edit credential; this is a viewing interface, not a server-enforced read-only permission.

`driver-zh.json` contains bundled Traditional Chinese names and descriptions for all seed activities and generated breaks. Translations match the actual source text, not card IDs, to prevent showing obsolete translations after edits. Custom activities can supply `driverTitle` and `driverNotes` through Description & more. Untranslated English remains visible and is marked for confirmation; there is no automatic translation service or external language package. Times and order come from the current snapshot.

Shared editing debounces saves by 350 ms and polls every three seconds, with requests capped at 12 seconds. Polling pauses while hidden, dragging, editing, or resolving a conflict. Saves retry after three seconds if disconnected. The database locks the trip row and compares revisions before replacing the snapshot: stale saves are rejected, not merged. Pending drafts are stored locally; loading latest attempts to keep a recovery backup. Successful saves alone do not reload the page.

Validation: `python3 tests/driver-view.py` covers the Chinese fields, local preview, mocked shared reorder/update, stale revision rejection, recovery backup, offline warning/recovery, translation coverage, escaping, and mobile widths.

## Adding a place: search, research and travel check

The activity form runs top to bottom in three steps: **Where to?**, **What & when**, and **Does it fit your day?**

- **Search as you type.** Suggestions come from the bundled catalogue (`places.json`, 14 researched venues) and, after 3 characters and a short pause, from [Photon](https://photon.komoot.io/), an OpenStreetMap search built for type-ahead. Only the search text, the area box and a nearby point for ranking are sent. Requests are debounced, cancelled when superseded, and cached per page. Arrow keys and Enter work. Nominatim is no longer used because its policy forbids autocomplete.
- **Choosing a place** shows a loading screen with each step: pin it on the map, work out travel times, then (on a private shared trip) let **Orbit** research the address, opening hours, booking information and a short description, and check the plan. **Skip** stops waiting at any point without losing what is already filled in. An empty activity name is filled from the place.
- **Open in Google Maps** appears on the selected place, on timeline cards and in the Chinese driver view. Each travel leg has a **Route** link to Google Maps driving directions.
- **Travel check.** Driving distance and time from the previous stop and to the next stop come from the public [OSRM](https://project-osrm.org/) demo router (OpenStreetMap data, no traffic). If it is unavailable, a labelled rough estimate is used (straight line × 1.3 at ~40 km/h, plus 5 minutes). "Getting around" cards without a place are treated as the journey itself, so the stop before them is measured. Neighbouring activities without a saved place use a matching catalogue venue when there is exactly one.
- **Making it fit.** Days are packed back to back, so the check compares travel time with the real free time between stops. When a drive doesn't fit, **＋ Add a drive** inserts a "Getting around" card (travel time + 10 minutes, rounded up to 5) before or after the stop. It is previewed in the day budget and saved with the activity, and later activities move to make room.
- **Orbit's view.** Orbit (Qwen) gives a verdict (looks good / tight / not recommended), short reasons and one suggestion, taking the opening hours, travel and timing into account. If you change the time, day, duration or place afterwards, the verdict is marked out of date with a **Re-check with Orbit** button.
- **Can't find it?** "Research with Orbit" and "Enter the details yourself" are always the last two suggestions.

Saved places keep `lat`/`lon` and `openingHours`/`openingHoursZh` alongside the existing fields, and are validated on import. All displayed text and URLs are escaped/checked. The public Photon and OSRM services are free for light, fair use with attribution; switch `suggestUrl`/`routeUrl` in `places-config.json` (or set `enabled: false`) if usage grows.

Validation: `tests/places.py` (suggestions, debounce/cache, keyboard, escaping, travel legs and fallback estimate, map outage, manual entry, stale responses, drive cards, driver view, persistence, mobile layout) and `tests/research-ui.py` (Orbit prerequisite, minimal payloads, loading steps, stale verdict re-check, Research with Orbit candidates, quota errors, skip and late responses, mobile layouts). Photon, OSRM and Orbit are mocked; this test environment cannot reach those hosts.

## Day map

Wide screens show a live map beside the itinerary; tablets and phones open it full screen with the **🗺 Map** button.

- Each stop with a place is a **numbered pin** in visit order, coloured by activity type, joined by the driving route (one OSRM request per day, cached on the device). Tap a pin for what the place is, its time slot and opening hours, **Show in plan** and **Google Maps**.
- The timeline shows **🚗 drive time and distance** between consecutive pinned stops, with a warning when the planned gap is shorter than the drive, and a Route link to Google Maps directions.
- **Not on the map yet** lists stops without a place; each opens the place search pre-filled from the card. Saved places without coordinates are located once with the map search and remembered on the device.
- **Optimise route** suggests a shorter order within runs of play and shopping stops, keeping meals, hotels, drives and the day's first stop fixed. It previews the order and saving (estimated), applies as one change, and can be undone.
- If routing is unavailable, straight-line estimates are shown with ≈ and a dashed line.

Map tiles: © OpenStreetMap contributors (`tileUrl` in `places-config.json`); routes: OSRM. Leaflet 1.9.4 is bundled in `vendor/leaflet` (BSD-2-Clause). Validation: `tests/map-view.py`.

## Orbit: AI venue research and plan checks

Orbit is the app's name for its Qwen-powered helper. It works on **private shared trips** only. The browser calls the Supabase edge function, which holds the Qwen (Alibaba Cloud Model Studio) key and enforces authorization, persistent daily quotas, caching, and source checking. Research sends only the place name and address; a plan check sends only the chosen place, its date and times, and the names and times of the stops just before and after it, never the trip key, notes or the rest of the itinerary. Setup and activation checks are in [DEPLOY.md](DEPLOY.md#orbit-qwen-place-research-and-plan-checks). Publishing the website alone does not activate the edge function; deployment and an authenticated live request must succeed separately. Places researched earlier with Claude or Qwen keep their saved details.
