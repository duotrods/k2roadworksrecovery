import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Auto-update the service worker on the next visit after a new deploy,
      // so users always get the latest build without a manual "refresh" prompt.
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'K2 Roadworks Recovery',
        short_name: 'K2 Recovery',
        description: 'Incident reporting and monitoring for K2 Vehicle Recovery schemes.',
        theme_color: '#0865ad',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell (build output) so the UI opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Offline navigations fall back to the SPA entry, but never for the
        // API — those must always hit the network (no stale data).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  optimizeDeps: {
    entries: ['./index.html'],
  },
  // `wrangler pages dev` proxying the whole app (frontend + /api) breaks
  // Vite's own module transform for index.html/HMR requests. So for local
  // dev, Vite serves the frontend as normal and only /api/* is forwarded to
  // a `wrangler pages dev --port 3000` process running separately just for
  // the Cloudflare Pages Functions (two-terminal setup: `npm run dev` here,
  // `wrangler pages dev` for functions/api/*, secrets in .dev.vars).
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
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
