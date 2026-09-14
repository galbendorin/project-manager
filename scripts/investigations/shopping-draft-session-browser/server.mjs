import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const server = await createServer({ configFile: false, root,
  server: { host: '127.0.0.1', port: 52224, strictPort: true, fs: { allow: [repository] } },
});
await server.listen(); server.printUrls();
