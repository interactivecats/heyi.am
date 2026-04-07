/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:17845',
      '/preview': 'http://localhost:17845',
      '/heyiam-mount.js': 'http://localhost:17845',
      '/screenshots': 'http://localhost:17845',
    },
  },
})
