# Instructions for AI agents (ChatGPT Codex, Claude, and others)

## Orbit's knowledge file

`orbit-knowledge.md` is what Orbit, the site's chat helper, knows beyond live Google Maps data. Orbit reads the
whole file before every answer, within about 10 minutes of a change reaching `main`.

When asked to add to Orbit's knowledge:
- Edit only `orbit-knowledge.md`, keeping its sections and rules (see the top of the file).
- Add concrete, checkable facts with a date and source, e.g. `(checked 2026-11-02, official site)`. Don't add
  opening hours, prices or ratings that Google Maps already gives Orbit live, unless they differ in a way that matters.
- Write for parents of a 2-year-old and a 6-year-old: strollers, naps, toilets, food, queues, weather.
- Keep it under 30,000 characters. Merge or trim old notes rather than appending duplicates.
- Never add private data: passport or ID numbers, phone numbers, booking references, payment or health details.
  The file is public.
- Work on a branch and open a pull request for the owner to review. Don't change code in the same pull request.
