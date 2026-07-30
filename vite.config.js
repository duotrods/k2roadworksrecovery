import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    entries: ['./index.html'],
  },
  // `vercel dev` proxying the whole app (frontend + /api) breaks Vite's own
  // module transform for index.html/HMR requests. So for local dev, Vite
  // serves the frontend as normal and only /api/* is forwarded to a
  // `vercel dev` process running separately just for the serverless
  // functions (see README/dev instructions for the two-terminal setup).
  server: {
    proxy: {
      '/api': 'http://localhost:3000', 'https://k2roadworksrecovery.vercel.app',
    },
  },
  // Strip noisy console.log/info/debug from the *minified* (production) bundle
  // only. Dev keeps all logs (Vite doesn't minify in dev). console.warn/error
  // are intentionally kept.
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor libs into stable, separately-cached chunks so the
        // main bundle is smaller and these don't re-download on every deploy.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory'))
            return 'charts'
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify'))
            return 'pdf'
          return 'vendor'
        },
      },
    },
  },
})
