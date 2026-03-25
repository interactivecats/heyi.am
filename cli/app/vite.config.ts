import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
