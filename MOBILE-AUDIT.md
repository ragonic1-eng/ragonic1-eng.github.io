# Mobile usability audit

Audited on 26 October 2026 using Chromium with touch input at 320×568, 390×844, 430×932, and 740×375. Also checked a shortened 360px viewport as a keyboard-height approximation. These are browser-emulation checks; physical iPhone/Safari keyboard behavior was not tested.

| Finding | Change |
| --- | --- |
| Save was below the initial form viewport (about y=1163 at 390×844). | Separate scrolling form content and an always reachable Save/Cancel footer. Dialogs follow the visual viewport and account for keyboard offset and safe areas. |
| Many targets were 22–40px, including library additions, time buttons, edit actions, and description toggles. | Mobile controls use at least 44px targets; card Edit/Move are prominent labelled actions, with Earlier/Later and Remove below. Checkboxes have larger label targets. |
| Form text was 12px and save status was hidden. | Inputs use 16px text; save/sync/error status remains visible in the mobile action bar. |
| Adding or finding the current card required returning to a distant page section. | Bottom actions provide Add, Now/Next, and Undo. Content has space below it so the toolbar does not cover the last card. |
| Moving to another day used a small dropdown and appended without a position preview. | Move screen selects day and position, previews start/finish/duration, retains descriptions and reminders, and reveals the moved card. Works within one day too; desktop select remains available. |
| Sticky dates and feedback could interfere with reaching controls. | Compact date tabs, scroll padding, a toolbar-aware message position, and correctly dismissed messages. Selected date stays visible in the horizontal tabs. |
| Description-only edits could consume an existing gap and shift subsequent times. | Preserve the edited card’s original slot during clock-time placement. Unchanged durations keep subsequent times; an edited shorter activity can leave breathing room. |
| Day settings took significant space before the itinerary. | Collapsible day timing/budget, with start/end and total duration visible in its summary. All settings remain accessible. |

## Verification

`tests/mobile-usability.py` exercises actual touch taps for adding, editing free text, moving across dates and within a day, reordering, Undo, current-card navigation, and Cancel. It verifies reachable action footers, 16px inputs, 44px card controls, preserved flight/airport times after description editing, unique cards after moves, reload persistence, no horizontal overflow, and no browser runtime errors. Inspected screenshots of the mobile card and move screen.

Existing feedback, failure-recovery, native desktop dragging, and live-time/overnight behavior checks remain in the other `tests/` scripts. Shared polling defers remote updates while the Move screen is open, as it already does for the activity and reminder editors.
