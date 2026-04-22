import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// ESM-safe __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use explicit alias objects so subpath imports like 'three/tsl' are resolved correctly
    alias: [
      // force all imports of 'three' to the single node_modules copy to avoid duplicate runtimes
      { find: 'three', replacement: path.resolve(__dirname, 'node_modules/three') },
      { find: 'three/webgpu', replacement: path.resolve(__dirname, 'src/shims/three-webgpu.js') },
      { find: 'three/tsl', replacement: path.resolve(__dirname, 'src/shims/three-tsl.js') },
    ]
  },
  optimizeDeps: {
    // Only pre-bundle the core `three` package. Leave `three-globe` un-optimized
    // so our `resolve.alias` shims for `three/webgpu` and `three/tsl` are applied
    // during dev and preview. Pre-bundling `three-globe` causes esbuild to try
    // to load `node_modules/three/webgpu` and `node_modules/three/tsl` which may
    // not exist in some Three builds and leads to the dependency optimization
    // error seen earlier.
    include: ['three'],
    exclude: ['three-globe']
  },
  build: {
    // Increase warning threshold to avoid false positives for our large vendor chunks
    chunkSizeWarningLimit: 600, // in KB (default 500)
    rollupOptions: {
      output: {
        // Split large libraries into named chunks so they don't end up in the main bundle.
        manualChunks(id) {
          if (!id) return
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('three-globe')) return 'vendor_three'
            if (id.includes('plotly.js') || id.includes('react-plotly.js')) return 'vendor_plotly'
            if (id.includes('react') || id.includes('react-dom')) return 'vendor_react'
            return 'vendor_misc'
          }
        }
      }
    }
  },
  server: {
    // Proxy API requests to bypass CORS during development
    proxy: {
      '/remote-api': {
        target: 'https://www.eyenetbio.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/remote-api/, ''),
        configure: (proxy, options) => {
          // Log proxied requests for debugging
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying:', req.method, req.url, '→', options.target + req.url.replace(/^\/remote-api/, ''))
          })
        }
      }
    },
    // development server response headers to help surface header-related issues locally
    headers: {
      // prefer explicit Cache-Control instead of Expires
      'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      // recommended security header
      'x-content-type-options': 'nosniff'
      , 'content-security-policy': "frame-ancestors 'self'"
    }
  },
  preview: {
    // preview server (vite preview) uses these headers as well
    headers: {
      'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'x-content-type-options': 'nosniff'
      , 'content-security-policy': "frame-ancestors 'self'"
    }
  },
})
