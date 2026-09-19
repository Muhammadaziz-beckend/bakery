import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: ['offis.maximumcomfort.pro'],
    host: "0.0.0.0",  // Access from any device in the local network
    port: 5174,        // You can change the port if needed
    mimeTypes: {
      'application/javascript': ['js'],
    },
  },
  plugins: [react()],
  base: "/",           // Update this if deploying to a subdirectory
  build: {
    chunkSizeWarningLimit: 1000,  // Adjust chunk size warning limit (optional)
  },
})