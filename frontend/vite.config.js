import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Frontend port
    strictPort: true, // Fail if port is not available
    open: true, // Open browser on server start
    proxy: {
      // Proxy API requests to backend server
      '/api': {
        target: 'http://localhost:8000', // Backend URL
        changeOrigin: true, // Required for virtual hosted sites
        secure: false, // Accept self-signed certificates if any
        ws: true, // Handle WebSockets too
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from:', req.url, proxyRes.statusCode);
          });
        },
      }
    }
  }
})