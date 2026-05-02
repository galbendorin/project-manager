## Repo workflow

### Source of truth

- Primary working repo: `/Users/doringalben/Documents/New project 2/project-manager-live`
- GitHub remote: `https://github.com/galbendorin/project-manager.git`

Work from this repo for all app changes.

Treat these folders as older archives or scratch copies unless the user explicitly moves the active project again:

- `/Users/doringalben/Documents/New project 2`
- `/Users/doringalben/Documents/project-manager`
- `/tmp/project-manager-publish`

### Branch rules

- `main` = stable branch only; do not push it live while it is behind `origin/main` or has unrelated local changes.
- Work branches should follow `codex/<topic>`.
- Keep household tools behind `household_tools_enabled` and out of the public PM launch surface unless explicitly enabled.

### Local workflow

```bash
cd "/Users/doringalben/Documents/New project 2/project-manager-live"
git status --short --branch
git fetch origin
npm install
npm run dev
```

If the worktree is clean and `main` is behind, sync before release work:

```bash
git pull --ff-only origin main
```

### Before pushing

Run the local preflight from the real repo:

```bash
npm run release:preflight
```

If authenticated smoke credentials are not available locally, run the deterministic checks and skip smoke only for local iteration:

```bash
npm run release:preflight -- --skip-smoke
```

Run `npm run smoke:user` before pushing live when the `SMOKE_*` environment variables are available.

### Release flow

1. Do the work on a `codex/*` branch.
2. Push the branch to GitHub.
3. Review the Vercel preview deployment.
4. Test the main user journeys there.
5. Merge to `main` only when the preview is approved.
6. Let production deploy from `main`.

### Working principle

Preview first, production second.

That keeps redesign work, UI experiments, and bug fixes from going live before we have checked them properly.
