import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const server = await createServer({ configFile: false, root,
  plugins: [{ name: 'synthetic-shopping-service', enforce: 'pre', resolveId(source) {
    return source.endsWith('/lib/supabase') ? `${root}environment.js` : null;
  } }], server: { host: '127.0.0.1', port: 52233, strictPort: true, fs: { allow: [repository] } },
});
await server.listen(); server.printUrls();
