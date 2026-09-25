import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const pages = ['AuthPage', 'LegalPage', 'PublicPricingPage', 'ProjectSelector', 'AppWorkspaceShell', 'AuthenticatedToolShells'];
const server = await createServer({
  configFile: false, root, css: { postcss: repository },
  plugins: [{ name: 'startup-navigation-fixture', enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/lib/supabase')) return `${root}environment.jsx`;
      const page = pages.find(name => source.endsWith(`/components/${name}`));
      return page ? `\0startup-page:${page}` : null;
    },
    load(id) {
      if (!id.startsWith('\0startup-page:')) return null;
      const name = id.split(':')[1];
      const header = "import { createElement as h } from 'react';\n";
      if (name === 'AuthenticatedToolShells') return header +
        ['Track', 'Shopping', 'MealPlanner', 'Baby', 'Habits', 'Weight', 'ItilQuiz', 'FinancePlanner']
          .map(tool => `export const Authenticated${tool}Shell = () => h('h1', null, '${tool} fixture');`).join('\n');
      if (name === 'AppWorkspaceShell') return header + "export const MainApp = () => h('h1', null, 'Project fixture');";
      return header + `export default () => h('h1', null, '${name} fixture');`;
    },
  }],
  server: { host: '127.0.0.1', port: 52307, strictPort: true, fs: { allow: [repository] } },
});
await server.listen(); server.printUrls();
