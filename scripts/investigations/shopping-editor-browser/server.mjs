import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const mocks = new Set(['../contexts/PlanContext', '../hooks/useShoppingListData',
  '../hooks/useShoppingListLiveUpdates', '../hooks/useOnlineStatus', '../utils/shoppingSessionTransport']);
const server = await createServer({ configFile: false, root,
  css: { postcss: repository },
  define: { 'import.meta.env.VITE_SHOPPING_DURABLE_CREATES': JSON.stringify('true') },
  plugins: [{ name: 'isolated-shopping-environment', enforce: 'pre', resolveId(source, importer = '') {
    if (source.endsWith('/lib/supabase') || mocks.has(source)) return `${root}environment.jsx`;
    if (importer.endsWith('/src/contexts/AuthContext.jsx') && source === '../utils/offlineState') return `${root}environment.jsx`;
    if (importer.endsWith('/src/utils/shoppingDraftOwner.js') && source === './shoppingCreateJournal.js') return `${root}journal.js`;
    return null;
  } }], server: { host: '127.0.0.1', port: 52232, strictPort: true, fs: { allow: [repository] } },
});
await server.listen(); server.printUrls();
