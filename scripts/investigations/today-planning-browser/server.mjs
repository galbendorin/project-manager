import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const server = await createServer({
  configFile: false, root, publicDir: false, plugins: [{ name: 'synthetic-transport', enforce: 'pre', resolveId(id) { if (/\/lib\/supabase(?:\.js)?$/.test(id)) return `${root}synthetic.js`; } }, react()],
  css: { postcss: repository },
  server: { host: '127.0.0.1', port: 4196, strictPort: true, fs: { allow: [repository] } },
});
await server.listen(); server.printUrls();
