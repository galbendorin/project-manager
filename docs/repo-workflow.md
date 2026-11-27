## Repo workflow

### Source of truth
- Work directly from the cloned `project-manager` repository root.
- GitHub remote: `https://github.com/galbendorin/project-manager.git`

### Branch rules
- `main` is live production (Vercel auto-deploys from `main`). Never push directly to `main` while behind `origin/main` or with unverified local changes.
- Feature and fix branches should follow `codex/<topic>`, created from updated `origin/main`.
- Keep household tools gated behind `household_tools_enabled` and out of the public PM launch surface unless explicitly enabled.

### Local workflow

```bash
git status --short --branch
git fetch origin
npm install
npm run dev
```

If the worktree is clean and `main` is behind, sync before starting branch work:

```bash
git pull --ff-only origin main
```

### Before pushing

Run local preflight from the repository root:

```bash
npm run release:preflight
```

If authenticated smoke credentials are not available locally, run deterministic checks and skip smoke only for local iteration:

```bash
npm run release:preflight -- --skip-smoke
```

Run `npm run smoke:local` before pushing live when `.env.smoke.local` or `SMOKE_*` environment variables are available. See [docs/smoke-testing.md](smoke-testing.md).

For phone-sensitive changes, also verify at `390px` and `1280px` viewports and follow [docs/mobile-regression-checklist.md](mobile-regression-checklist.md).

For database schema, RLS, or RPC changes, place new timestamped migrations in `supabase/migrations/` (see [supabase/README.md](../supabase/README.md)) rather than modifying historical scripts in `scripts/sql/`.

### Release flow

1. Create a `codex/<topic>` branch from `origin/main`.
2. Push the branch and open a pull request against `main`.
3. Verify the Vercel preview deployment and all required GitHub Actions checks on the exact PR head SHA.
4. Complete peer review before merging.
5. Merge to `main` only after preview, review, and hosted CI pass, then confirm the post-merge `main` GitHub Actions run completes successfully.

### Working principle

Preview first, production second.
