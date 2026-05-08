# Mobile Regression Checklist

Run this checklist before shipping changes that touch mobile layout, Shopping List, Meal Planner, Tasks, Timesheet, or navigation.

## Core phone flow

- Sign in on a narrow viewport or phone.
- Open Projects and confirm the page does not horizontally scroll.
- Use Continue/Open latest and confirm it opens the expected project.
- Switch between Schedule, Tasks, Status Report, Risk Log, and Timesheet.
- Open and close a task edit sheet; confirm the footer buttons stay visible.

## Shopping List

- Open Shopping List from Projects.
- Add two safe test items.
- Scroll down into the bought/open list area.
- Split screen with a supermarket site or another browser window.
- Move focus between windows several times.
- Confirm PM Workspace does not jump back to the top or force repeated refreshes.
- Mark an item as bought and confirm the list position remains usable.
- Toggle Show bought and confirm grouped bought items do not crowd the phone layout.

## Meal Planner

- Open Meal Planner only with household tools enabled.
- Switch meal planner panels on a phone width.
- Add or edit a safe test meal.
- Confirm the shopping/grocery handoff controls remain reachable.

## Timesheet

- Open Timesheet from Projects.
- Add or edit one safe time entry.
- Switch week controls and confirm the grid does not overflow.
- Export/report buttons should remain tappable without text clipping.

## Offline and sync confidence

- Briefly disable network after the page has loaded.
- Make one safe change in Shopping List or Timesheet.
- Confirm the app shows a queued/offline state.
- Re-enable network and confirm the queued state clears.

## Release check

Run:

```bash
npm run release:preflight -- --skip-smoke
```

Run authenticated smoke separately when credentials and browser access are available:

```bash
npm run smoke:local
```
