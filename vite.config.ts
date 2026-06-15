import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// On a production build we serve from GitHub Pages at /UTC/, so assets need that
// base. Local dev stays at / so http://localhost:5173 works normally.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/UTC/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
}))
