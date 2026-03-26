# PM Workspace

## Stack
- Vite + React 18
- Tailwind CSS plus shared product styles in `src/styles/index.css`
- Supabase for auth and app data
- Vercel serverless endpoints in `api/`
- SQL migrations and support scripts in `scripts/`

## Core Commands
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run test:ci`
- `npm run preview`

## Working Rules
- Search with `rg` and `rg --files`.
- Use `apply_patch` for manual code edits.
- Check `git status --short` before staging.
- Never revert or stage unrelated worktree changes.
- Keep changes narrow and task-shaped. Avoid broad refactors unless the request calls for them.
- Treat `main` as production-sensitive. Verify before push.

## Product Standards
- Preserve the established PM Workspace visual language unless the user explicitly asks for a redesign.
- Default to simple, functional interfaces with clear hierarchy.
- Mobile is first-class. Any user-facing UI change must be checked at phone and desktop widths.
- Avoid generic dashboard clutter or decorative cards that do not improve clarity.
- Prefer one primary action per section.
- Keep product copy short, literal, and consistent with nearby screens.

## Table And Form Standards
- Dense screens such as registers, tracker, tasks, and timesheets should optimize for scanning first.
- Prefer clear direct actions over hidden gestures when the action matters.
- Do not shrink desktop tables until they become unreadable on mobile. Provide a mobile fallback layout instead.
- Use color as supporting signal, not the only indicator of state.
- Empty, loading, error, and disabled states should feel intentional, not left over.

## Security And Data Guardrails
- Preserve existing auth and RLS assumptions unless the task explicitly changes them.
- Call out required SQL, Vercel, or Supabase follow-up when code depends on it.
- Never expose service-role or secret keys in client code or `VITE_` variables.

## Verification
- Run `npm run build` before handoff for code changes.
- Run targeted tests when helpers or logic change.
- For UI work, verify desktop and mobile behavior, plus the main happy path and obvious empty state.
- If browser tooling is unavailable, say so explicitly and still do a code-path sanity check.

## Definition Of Done
- Only intended files are staged.
- Build passes.
- Changed flows remain usable on mobile and desktop.
- Copy is concise and coherent with the surrounding UI.
- Risks, assumptions, and manual rollout steps are called out clearly.

## Recommended Agent Flow
- Use `repo_explorer` first when the owning files are not obvious.
- Use `design_partner` before or during larger UI polish work.
- Use `reviewer` for risky changes, regressions, or pre-push checks.
- Use `browser_debugger` when a layout or interaction issue needs reproduction evidence.
