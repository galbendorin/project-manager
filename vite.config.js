import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildPrecacheUrls,
  injectServiceWorkerManifest,
} from './src/utils/pwaCacheManifest.js'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// Temporary Q04 phone candidate. Production and every other branch retain
// their existing configuration. Do not merge this verification branch.
const q04PhoneCandidate = process.env.VERCEL_ENV === 'preview'
  && process.env.VERCEL_GIT_COMMIT_REF === 'codex/q04-phone-candidate'

const q04PhoneVerification = () => ({
  name: 'q04-phone-verification',
  enforce: 'pre',
  async generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'q04-update-diagnostics-7.js',
      source: await readFile(path.join(projectRoot, 'scripts/investigations/q04-update-diagnostics.js'), 'utf8') })
  },
  transform(code, id) {
    if (id.split('?')[0] !== path.join(projectRoot, 'src/components/ShoppingListView.jsx')) return null
    const expected = "const SHOPPING_PROJECT_NAME = 'Shopping List';"
    if (!code.includes(expected)) throw new Error('Q04 test-list isolation needs review.')
    return code.replace(expected, "const SHOPPING_PROJECT_NAME = 'Q04 TEST - hosted verification';")
  },
  transformIndexHtml(html) {
    return html.replace('<title>', '<title>Q04 TEST — ')
      .replace('<body>', '<body><aside role="status" style="padding:10px;background:#fff5d6;color:#332500;text-align:center">Q04 test candidate 7 · Rollback check: new Shopping flow OFF. Separate test list.</aside>')
      .replace('</body>', '<script defer src="/q04-update-diagnostics-7.js"></script></body>')
  },
})

const collectOutputFiles = async (directory, rootDirectory = directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectOutputFiles(entryPath, rootDirectory)
    }
    return path.relative(rootDirectory, entryPath)
  }))

  return files.flat()
}

const pwaPrecacheManifest = () => {
  let outputDirectory = path.join(projectRoot, 'dist')

  return {
    name: 'pmworkspace-pwa-precache-manifest',
    apply: 'build',
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const workerPath = path.join(outputDirectory, 'sw.js')
      const outputFiles = await collectOutputFiles(outputDirectory)
      const precacheUrls = buildPrecacheUrls(outputFiles)
      const source = await readFile(workerPath, 'utf8')
      const cacheHash = createHash('sha256').update(source)

      for (const url of precacheUrls) {
        const relativePath = url.replace(/^\//, '')
        cacheHash.update(relativePath)
        cacheHash.update(await readFile(path.join(outputDirectory, relativePath)))
      }

      const nextSource = injectServiceWorkerManifest(source, {
        version: cacheHash.digest('hex').slice(0, 16),
        urls: precacheUrls,
      })
      await writeFile(workerPath, nextSource, 'utf8')
    },
  }
}

export default defineConfig({
  plugins: [react(), ...(q04PhoneCandidate ? [q04PhoneVerification()] : []), pwaPrecacheManifest()],
  ...(q04PhoneCandidate ? {
    define: { 'import.meta.env.VITE_SHOPPING_DURABLE_CREATES': JSON.stringify('false') },
  } : {}),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return null
          if (id.includes('xlsx')) return 'xlsx'
          if (id.includes('@supabase')) return 'supabase-vendor'
          if (id.includes('react')) return 'react-vendor'
          return 'vendor'
        }
      }
    }
  },
  server: {
    port: 3002,
    strictPort: true,
    // Proxy /api requests to vercel dev (run `vercel dev --listen 3001` separately)
    // Only needed for local testing of AI features — remove or ignore if not testing locally
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
