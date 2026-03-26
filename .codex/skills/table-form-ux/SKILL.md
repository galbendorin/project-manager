---
name: table-form-ux
description: Improve dense PM Workspace tables and forms such as registers, tracker, tasks, and timesheets. Use for inline editing, mobile fallbacks, direct actions, and clearer dense-data workflows.
---

# Table And Form UX

Use this skill for screens where users manage many rows, fields, or filters quickly.

## Focus
- scanability
- inline editing clarity
- action discoverability
- filter and sort ergonomics
- mobile fallback structure

## Inputs
- target screen or component
- user task that should feel faster
- any desktop or mobile constraint

## Output
- a simpler dense-data interaction model
- notes on scanning, editing, and mobile behavior
- regression risks if shared helpers or row state are involved

## Process
1. Identify the main job the user is trying to do on the screen.
2. Remove or compress labels that repeat what the layout already says.
3. Keep one clear interaction model per surface.
4. Prefer explicit controls for important row actions.
5. If the desktop table will not survive on mobile, switch to a card or detail-sheet pattern instead of squeezing it.

## PM Workspace Defaults
- Registers and tracker views should favor fast scanning over decorative density.
- Important row actions should remain obvious.
- Color can support organization, but text and structure must still carry meaning.
- Forms should guide the next action without long instructional copy.
