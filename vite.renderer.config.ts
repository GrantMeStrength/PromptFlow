import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/@monaco-editor') || id.includes('node_modules/monaco-editor')) return 'vendor-monaco'
          if (id.includes('node_modules/reactflow') || id.includes('node_modules/@reactflow')) return 'vendor-reactflow'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react'
          if (id.includes('node_modules/lucide-react')) return 'vendor-lucide'
          if (id.includes('node_modules/zustand')) return 'vendor-zustand'
        },
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/renderer/src') },
  },
  server: { port: 5173 },
})
