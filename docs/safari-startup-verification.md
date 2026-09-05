# Safari and Home Screen startup recovery

Verified 5 September 2026 for the Safari update-recovery release.

## Changes

- Online navigation requests current HTML, with a bounded fallback to the active worker's complete offline shell. Other workers' HTML cannot leak into this fallback.
- Updates retain the previous two complete app caches for open pages. Hashed assets can be read from those caches, and HTML returned for a missing script is rejected.
- New installs revalidate their files, reject incomplete asset batches, and remove partially written caches. Worker source participates in the cache version.
- Cache Storage reads/cleanup and IndexedDB operations have deadlines. Failed background cache writes cannot block downloaded scripts.
- The first recovery-capable worker automatically adopts a legacy installation. Only legacy windows already requesting recovery are navigated; healthy editing windows stay open.
- A script before the main module graph handles missing startup files. React render failures also have a fallback. Automatic reload is guarded by both session storage and the URL, and the guard clears only after a rendered page stays healthy for 30 seconds.
- The update button waits for controller activation, and a timeout leaves the current page usable.
- A settled auth session or newer auth event cancels the fallback timer. A late initial session cannot undo sign-out.

## Validation

`npm run release:preflight -- --skip-smoke` passed: hooks check, lint, 407 tests, and production build.

Behavioral tests cover unavailable and hanging browser storage, stale auth fallback/sign-out races, missing assets and incorrect MIME types, offline shell selection, old assets after activation, migration, and bounded reload recovery with unavailable session storage.

The built app was served locally with the production Content Security Policy. Browser checks confirmed:

- Normal public/sign-in page startup.
- A deliberately missing main script triggers one automatic recovery and then the visible retry screen; query and fragment survive.
- Restoring the file and selecting Try again successfully opens the app.
- A deliberately missing lazy sign-in chunk produces the same bounded recovery.
- Recovery layout fits at 390 × 844 and desktop width with no horizontal overflow.

The in-app browser is not an iPhone Safari device. Actual iOS Home Screen resume and the affected device's saved state were not directly tested. Authenticated cloud-data smoke was unavailable because no dedicated smoke account credentials were configured. No SQL or Supabase configuration change is required.

## Production confirmation

After deployment, confirm the live HTML references `app-bootstrap.js` and the published worker contains the cache deadlines and legacy migration. On iPhone, launch the existing Home Screen app online, apply an available update, return from the background, and open a project/household tool. Also open the same site in a normal Safari tab. A previously blank legacy window may need one close/reopen to run the newly activated worker; deleting the installed app or clearing stored work is not part of this repair.
