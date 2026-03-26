---
name: browser-verify
description: Verify PM Workspace flows after UI or interaction changes. Use for desktop and mobile checks, layout overflow, tap targets, route behavior, and quick regression notes after implementation.
---

# Browser Verify

Use this skill after changing a screen, route, or interaction in PM Workspace.

## Focus
- desktop and mobile layout
- primary user action still reachable
- overflow, clipping, and spacing regressions
- empty-state and obvious error-path sanity checks

## Inputs
- route or screen to verify
- expected primary action
- any relevant account or project context

## Output
- pass or fail notes
- viewport-specific issues
- remaining risks or follow-up checks

## Process
1. Open the target flow at desktop and phone widths.
2. Exercise the main happy path first.
3. Check above-the-fold clarity, tap targets, and any horizontal overflow.
4. Note any obvious empty-state or loading-state problems.
5. If browser tooling is unavailable, say so and fall back to a code-path review.

## PM Workspace Defaults
- Product screens should remain usable in Safari-width mobile layouts.
- Navigation, create actions, and save actions must stay reachable without hunting.
- If a route depends on Vercel or Supabase configuration, mention that explicitly.
