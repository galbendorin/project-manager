import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const mocks = new Set(['../contexts/AuthContext', '../contexts/PlanContext']);
const components = new Set(['./AdminHealthPanel', './FinanceHouseholdInvitationCard', './AccentThemePicker']);
const server = await createServer({ configFile: false, root, css: { postcss: repository },
  plugins: [{ name: 'synthetic-project-service', enforce: 'pre', resolveId(source) {
    if (source.endsWith('/lib/supabase') || mocks.has(source)) return `${root}environment.jsx`;
    if (components.has(source)) return `${root}empty.jsx`;
    if (source === './ProjectShareModal') return `${root}refresh.jsx`;
    return null;
  } }], server: { host: '127.0.0.1', port: 52234, strictPort: true, fs: { allow: [repository] } },
});
await server.listen(); server.printUrls();
