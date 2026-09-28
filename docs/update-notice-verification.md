# Update notice on standalone tools

The Q04 physical iPhone Home Screen screenshot from 28 September at 14:22 shows an installed waiting worker and a loaded Shopping page without an update action. App rendered its update notice only after the no-selected-project branch had returned, excluding Shopping and other standalone tools.

The shared notice now renders in both authenticated application branches. Subscription setup also rechecks the pending worker to cover registration finishing between initial render and effect subscription. Activation still must succeed before the page reloads; a failed activation retains the page and retry action. The update button has a 44px minimum height independent of the application's root font size.

Validation: the complete CI command passed 696 tests, hooks checks, ESLint and the production build. Nine new tests execute the actual App route branches, update events, mount race and activation callbacks. After the touch-height adjustment the nine regression tests passed again. A real browser fixture using actual App/AuthProvider/PlanProvider and synthetic authentication showed the action on Shopping at desktop width and in a 390px containing block without horizontal overflow; the action measured 44px high. This is browser layout evidence, not physical Safari certification.

Physical-device completion still requires loading the corrected candidate, accepting an available update, confirming normal rendering and recovering the retained draft. Q04 activation and physical compatible-OFF rollback remain gated separately. Preview isolation and diagnostics are excluded from a production release of this fix.
