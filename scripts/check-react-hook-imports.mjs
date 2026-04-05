import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const REACT_HOOKS = [
  'useCallback',
  'useContext',
  'useDebugValue',
  'useDeferredValue',
  'useEffect',
  'useId',
  'useImperativeHandle',
  'useInsertionEffect',
  'useLayoutEffect',
  'useMemo',
  'useReducer',
  'useRef',
  'useState',
  'useSyncExternalStore',
  'useTransition',
];

const SOURCE_FILE_PATTERN = /\.(jsx?|mjs)$/;

const collectSourceFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(fullPath));
      continue;
    }

    if (SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
};

const getImportedReactHooks = (source) => {
  const imported = new Set();
  const reactImportPattern = /import\s+([\s\S]*?)\s+from\s+['"]react['"]/g;

  for (const match of source.matchAll(reactImportPattern)) {
    const clause = match[1] || '';
    const namedMatch = clause.match(/\{([\s\S]*?)\}/);
    if (!namedMatch) continue;

    namedMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const [importedName] = part.split(/\s+as\s+/i).map((value) => value.trim());
        if (importedName) imported.add(importedName);
      });
  }

  return imported;
};

const getMissingHookImports = (source, importedHooks) => {
  const missing = [];

  for (const hook of REACT_HOOKS) {
    const hookUsagePattern = new RegExp(`\\b${hook}\\s*\\(`);
    if (hookUsagePattern.test(source) && !importedHooks.has(hook)) {
      missing.push(hook);
    }
  }

  return missing;
};

const relativeToRoot = (filePath) => path.relative(process.cwd(), filePath) || filePath;

const main = async () => {
  const rootStat = await stat(ROOT).catch(() => null);
  if (!rootStat?.isDirectory()) {
    console.error(`Source root not found: ${ROOT}`);
    process.exit(1);
  }

  const sourceFiles = await collectSourceFiles(ROOT);
  const failures = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    const importedHooks = getImportedReactHooks(source);
    const missingHooks = getMissingHookImports(source, importedHooks);

    if (missingHooks.length) {
      failures.push({
        filePath,
        missingHooks,
      });
    }
  }

  if (failures.length) {
    console.error('Missing React hook imports detected:\n');
    failures.forEach(({ filePath, missingHooks }) => {
      console.error(`- ${relativeToRoot(filePath)}: ${missingHooks.join(', ')}`);
    });
    process.exit(1);
  }

  console.log(`React hook import check passed (${sourceFiles.length} files scanned).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
