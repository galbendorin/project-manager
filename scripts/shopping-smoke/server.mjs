import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export async function startShoppingSmokeServer({ port = 52913 } = {}) {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const mocked = new Set(['../contexts/AuthContext', '../contexts/PlanContext',
    '../hooks/useShoppingListLiveUpdates', '../utils/shoppingSessionTransport']);
  const server = await createServer({ configFile: false, root, envFile: false,
    css: { postcss: repository }, define: { 'import.meta.env.VITE_SHOPPING_DURABLE_CREATES': '"true"' },
    plugins: [{ name: 'q11-isolated-service', enforce: 'pre', resolveId(source) {
      if (mocked.has(source) || /\/lib\/supabase$/.test(source) || /\/utils\/pushNotifications$/.test(source)) return `${root}environment.jsx`;
      return null;
    } }, react()],
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [repository] } },
  });
  await server.listen();
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startShoppingSmokeServer();
  server.printUrls();
}
