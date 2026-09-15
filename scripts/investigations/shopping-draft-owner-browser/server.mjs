import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const offline = process.argv.includes('--offline');
const server = await createServer({ configFile: false, root,
  define: { 'import.meta.env.VITE_SHOPPING_DURABLE_CREATES': JSON.stringify('true') },
  plugins: [{ name: 'synthetic-auth-only', enforce: 'pre', resolveId(source, importer = '') {
    if (importer.endsWith('/src/contexts/AuthContext.jsx')) {
      if (source === '../lib/supabase' || source === '../utils/offlineState') return `${root}environment.js`;
    }
    if (importer.endsWith('/src/utils/shoppingDraftOwner.js') && source === './shoppingCreateJournal.js') return `${root}journal.js`;
    return null;
  }, transform(code, id) {
    // Simulate only the offline indicator, retaining the actual provider and
    // consumer effects. No real device/network emulation is claimed.
    if (offline && (id.endsWith('/src/contexts/AuthContext.jsx') || id === `${root}main.jsx`)) {
      return code.replaceAll('navigator.onLine === false', 'true');
    }
    return null;
  } }],
  server: { host: '127.0.0.1', port: 52230, strictPort: true, fs: { allow: [repository] } },
});
await server.listen(); server.printUrls();
console.log(`Synthetic startup: ${offline ? 'offline' : 'online'}`);
