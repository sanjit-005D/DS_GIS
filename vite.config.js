import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // force all imports of 'three' to the single node_modules copy to avoid duplicate runtimes
      three: path.resolve(__dirname, 'node_modules/three')
      , 'three/webgpu': path.resolve(__dirname, 'src/shims/three-webgpu.js')
      , 'three/tsl': path.resolve(__dirname, 'src/shims/three-tsl.js')
    }
  },
  optimizeDeps: {
    include: ['three', 'three-globe']
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
            if (id.includes('@supabase')) return 'vendor_supabase'
            return 'vendor_misc'
          }
        }
      }
    }
  },
  server: {
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
