# Task/checklist scrolling repair

Base: production main dc064583 (Q06). Owner reported clipped task/checklist content on Mac and requested phone coverage too.

The desktop task-details card had no viewport height bound or scroll body; an eight-item actual-component reproduction put its composer below the viewport. The mobile sheet's full-height body also occupied the header's height and extended below the sheet.

The desktop card now has a viewport-bounded flex layout with a non-shrinking header and one scrolling content body. The mobile header/body share the available height through flex layout; bottom padding includes the safe-area inset. Existing checklist callbacks, permissions, persistence, APIs and database remain unchanged.

## Verification

- `npm run ci`: all731tests, hooks/lint and production build passed. Final fixture lint also passed (two pre-existing hook warnings, no errors).
- Actual DesktopTodoDetailModal/MobileTodoDetailSheet/TaskCardChecklistPanel, synthetic in-memory callbacks, valid project options; no Supabase or production data requests. Fixture: `node scripts/investigations/task-scroll-browser/server.mjs` (127.0.0.1:52235).
- Desktop1440x900,1280x720,1280x480; phone390x844,375x667; breakpoint768/769x720. Native browser wheel scrolling reached the final composer/Add, with Close/Back still visible, body within the viewport and no horizontal page overflow.
- Empty checklist, eight rows, two24-row checklists with long titles; adding desktop/phone items, toggling and renaming succeeded. Empty-state checklist creation worked. Read-only and completed tasks had no composer and disabled checklist toggles. Closing returned to the usable fixture page.
- Resizing within the phone layout to667x375 retained composer text. Tab from the final composer focused the visible Add button (bottom282px in375px viewport).
- Phone screenshot saved beside the roadmap at task-scroll-evidence/phone-checklist.png; inspected visually for fixed header and final composer access.

## Limits and follow-up

These are Chromium browser checks at responsive sizes, not physical Mac Safari or iPhone touch/keyboard certification. The fixture has no hardware touch simulation. One owner iPhone check is still requested: open a long task checklist, swipe to its end, focus Add item and add a labelled test item with the keyboard open. Do not clear Safari data or reinstall. Any demonstrated keyboard-specific failure needs a separately bounded diagnosis before widening this CSS repair.

No composer retention claim across the existing desktop/mobile component swap at768px; existing behaviour there is unchanged. No auth, SQL, API or database changes. Publish after release checks, verify both production deployments, then resume Q07 with prior device evidence reused.
