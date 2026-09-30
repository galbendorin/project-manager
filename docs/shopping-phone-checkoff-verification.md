# Q10 phone grocery check-circle verification

The phone grocery check circle was a decorative aria-hidden span; desktop's
circle was already a button. The phone circle now invokes the existing
handleToggleTodo action, with a44x44CSSpixel target, visible keyboard focus and
normal/undo accessible labels. Saving, inline editing and read-only recovery
disable this new control. Existing Bought/Undo, desktop and write contracts are
unchanged. No API, SQL, RLS or storage changes.

Actual ShoppingListItemsPanel and QuickAdd were checked in an isolated browser
fixture using the production stylesheet. The fixture imports the unchanged
parent handleToggleTodo callback directly from ShoppingListView source, including
its existing1000ms timer. Persist/write results are injected synthetic state;
this is not hosted or physical Safari evidence.

- Circle starts one callback; a second tap/Enter during undo cancels with zero
  completion calls. Letting the existing timer expire produces one completion.
  Bought and the circle can start/undo the same operation.
- Tab reaches the labelled button with focus-visible styling. Space starts and
  Enter undoes once each. Quick-add Enter submits without completing a grocery.
- Saving and read-only disable the circle without dispatch; inline editing
  disables it, Save keeps the edited name and restores the control. Failed
  injected completion retains the grocery and Retry; injected offline completion
  keeps the queued state. Existing queue/recovery tests passed unchanged.
-390x844,375x667 and667x375 have44px circles, wrapping long titles/quantities,
  no overlap or horizontal overflow and retained quick-add text during resizing.
- Fresh768px/769px breakpoint checks select phone/desktop respectively. Desktop
  at1280x720 keeps its original35.75px circle and immediate completion behavior.
  The test browser's viewport override does not emit media-query change events;
  breakpoint checks therefore used fresh loads. No product resize defect claimed.

All757 tests, hook checks, lint and production build pass (two pre-existing hook
warnings). Browser behavioral/geometry assertions provide the layout evidence;
no CSS-string snapshot tests were added for this reversible UI change.

Ask for one brief physical iPhone16 Home Screen check after release: tap circle,
undo, then return to text entry with the keyboard open. Record this separately;
do not clear Safari data or reinstall. Q12 backup/restore remains owner-waived.
