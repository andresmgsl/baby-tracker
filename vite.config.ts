import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.NODE_ENV !== 'test' ? [VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Baby Tracker',
        short_name: 'Baby',
        theme_color: '#f2efe6',
        background_color: '#211e28',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        // The app shell is cached for offline launch; data lives on the server API,
        // which is never precached (navigateFallbackDenylist keeps /api uncached).
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    })] : []),
  ] as any,
  // Data now lives on the server API; the browser no longer runs SQLite/OPFS,
  // so cross-origin-isolation headers are no longer required.
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
