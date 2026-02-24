import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
