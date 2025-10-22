import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
	VitePWA({
		registerType: 'autoUpdate',
		// includeAssets: ['**/*'],
		manifest: {
			"name": "LoudScore",
			"short_name": "LoudScore",
			"icons": [
				{
					"src": "/pwa-192x192.png",
					"sizes": "192x192",
					"type": "image/png",
					"purpose": "any"
				},
				{
					"src": "/pwa-512x512.png",
					"sizes": "512x512",
					"type": "image/png",
					"purpose": "any"
				},
				{
					"src": "/pwa-maskable-192x192.png",
					"sizes": "192x192",
					"type": "image/png",
					"purpose": "maskable"
				},
				{
					"src": "/pwa-maskable-512x512.png",
					"sizes": "512x512",
					"type": "image/png",
					"purpose": "maskable"
				}
			],
			"scope": "/",
			"start_url": "/",
			"display": "standalone",
			"background_color": "#f8f8f8",
			"theme_color": "#f8f8f8",
			"description": "Loudness penalty analyzer"
		},
		workbox: {
			globPatterns: ["**/*.{js,css,svg,html,png}"]
		}
	})
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
