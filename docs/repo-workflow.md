## Repo workflow

### Source of truth

- Primary working repo: `/Users/doringalben/Documents/project-manager`
- GitHub remote: `https://github.com/galbendorin/project-manager.git`

Work from this repo for all app changes.

Do not use these folders as the main working copy:

- `/Users/doringalben/Documents/New project 2`
- `/tmp/project-manager-publish`

Those can stay as archive or scratch space, but not as the place we edit and ship from.

### Branch rules

- `main` = stable branch only
- `codex/stability` = current working branch for cleanup, fixes, and safe app improvements
- future work branches should follow `codex/<topic>`

### Local workflow

```bash
cd /Users/doringalben/Documents/project-manager
git checkout main
git pull
git checkout codex/stability
npm install
npm run dev
```

### Before pushing

Run the core checks from the real repo:

```bash
npm run test:ci
npm run build
```

Optional browser smoke test:

```bash
npm run smoke:user
```

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
