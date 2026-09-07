import { registerShoppingSyncRaceTests } from '../../scripts/investigations/shopping-sync-races.mjs';

// Q03 and controls run in release CI. Known Q04/Q05 reproductions remain
// available through the investigation command until their repairs are complete.
registerShoppingSyncRaceTests({ includeKnownFailures: false });
