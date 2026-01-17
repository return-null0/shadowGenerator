import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // This tells Vite: "Don't try to bundle these. Leave them as-is."
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  base: '/shadowGenerator/',

  worker: {

    format: 'es', 

  },
})