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
      const cacheHash = createHash('sha256')

      for (const url of precacheUrls) {
        const relativePath = url.replace(/^\//, '')
        cacheHash.update(relativePath)
        cacheHash.update(await readFile(path.join(outputDirectory, relativePath)))
      }

      const source = await readFile(workerPath, 'utf8')
      const nextSource = injectServiceWorkerManifest(source, {
        version: cacheHash.digest('hex').slice(0, 16),
        urls: precacheUrls,
      })
      await writeFile(workerPath, nextSource, 'utf8')
    },
  }
}

export default defineConfig({
  plugins: [react(), pwaPrecacheManifest()],
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
