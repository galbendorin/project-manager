import { registerShoppingSyncRaceTests } from '../../scripts/investigations/shopping-sync-races.mjs';

// Q03, Q05 and controls run in release CI. Historical legacy-Q04 reproductions
// remain separate; durable create/contribution suites cover its replacement.
registerShoppingSyncRaceTests({ includeKnownFailures: false });
