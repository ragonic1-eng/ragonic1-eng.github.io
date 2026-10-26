# Planning UX research · 26 October 2026

## Sources reviewed online

- [AdventureLog official project documentation](https://github.com/seanmorley15/AdventureLog): multi-day collections, categories, itineraries, notes, lodging, and collaboration capabilities.
- [Published itinerary screenshot](https://raw.githubusercontent.com/seanmorley15/AdventureLog/main/brand/screenshots/itinerary.png): prominent date and day number, item count, an add action, labelled categories, and lodging context.
- [Published locations screenshot](https://raw.githubusercontent.com/seanmorley15/AdventureLog/main/brand/screenshots/adventures.png): searchable card collection, category filtering, concise card metadata, and additional detail actions.

These are documentation and screenshot observations, not a hands-on evaluation of a logged-in session. No source code, photos, or interface assets were copied. There is no evidence here for declaring any product universally “best.”

After fixing Chromium trust for the platform proxy in an approved session, the public home pages of [Wanderlog](https://wanderlog.com), [TripIt](https://www.tripit.com/web), and [Roadtrippers](https://roadtrippers.com) all returned HTTP 200 and were reviewed visually. Wanderlog’s visible product preview places Share, Undo, trip dates, reservations, and itinerary/map context together. TripIt emphasizes organizing booking and travel details in one place. Roadtrippers offers explicit manual versus automatic planning and prominent origin/destination inputs. These are public-page observations; authenticated editors were not tested. See [browser navigation](BROWSER-NAVIGATION.md) for the verified approach and source guidance.

## Decisions for this family's planner

| Observed pattern / family need | Implementation |
| --- | --- |
| Clear date and day context | Seven sticky day tabs with dates, locations, activity counts, and planned time |
| Categorized idea collection | Searchable library with kids & play, food, stays, travel, shopping filters |
| Short cards with deeper information | Concise titles; expandable original family notes; explicit Edit action |
| Fit activities into finite days | Daily start/end controls, budget bar, overflow warnings, adjustable durations |
| Easy changes while planning | Desktop drag reorder, touch-friendly reorder buttons, add-here actions, date/time editor, undo |
| Predictable time-slot behavior | Insertion shifts later cards; free-time slots split; overlap with an earlier activity is explained rather than silently truncating it |
| Two-person sharing | Private edit links, persistent shared snapshots, automatic polling, and revision checks to prevent silent concurrent overwrites; export/import remains available |
| Calm, playful visual direction | Original starry sky and moon design, muted category colors, large mobile controls |

## Verification

Installed Chromium with Playwright exercised creation, edits, date/time selection, overlap prevention, free-gap splitting, reorder, cross-day moves, duration adjustment, budget fitting, deletion/undo, search/filter, persistence, exports/imports, and invalid import handling. Viewports: 390, 768, and 1440 pixels. Trip source: all 37 original activities and full notes from the uploaded workbook; the second upload was byte-identical to the first.
