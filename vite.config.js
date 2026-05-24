import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Necessário para Electron: caminhos relativos funcionam com file://
  base: './',
  build: {
    outDir: 'build/renderer',
    emptyOutDir: true,
  },
})
