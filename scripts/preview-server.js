#!/usr/bin/env node
/* eslint-env node */
// Simple static preview server that sets Cache-Control and X-Content-Type-Options headers
// Usage: node scripts/preview-server.js [port] (defaults to 5177)

const http = require('http')
const fs = require('fs')
const path = require('path')
const url = require('url')

const port = parseInt(process.argv[2], 10) || 5177
const root = path.resolve(process.cwd(), 'dist')

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'text/jsx; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}

if (!fs.existsSync(root)) {
  console.error('Preview server: dist directory not found. Run `npm run build` first.')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  try {
    // set recommended headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    const parsed = url.parse(req.url)
    let pathname = decodeURIComponent(parsed.pathname)
    // Sanitize: remove any parent-directory attempts like ../ or ..\
  // avoid regex escaping pitfalls: remove all '../' and '..\' occurrences
  while (pathname.indexOf('../') !== -1) pathname = pathname.split('../').join('')
  while (pathname.indexOf('..\\') !== -1) pathname = pathname.split('..\\').join('')
    let filePath = path.join(root, pathname)

    // if directory or not found, serve index.html (SPA fallback)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, 'index.html')
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = mime[ext] || 'application/octet-stream'
      // Set Content-Type (including charset for text types)
      res.setHeader('Content-Type', contentType)

      // Security: ensure we don't expose legacy or undesired headers.
      // Some scanners flag X-XSS-Protection and X-Frame-Options as deprecated or unnecessary.
  try { res.removeHeader('X-XSS-Protection') } catch (e) { void e }
  try { res.removeHeader('X-Frame-Options') } catch (e) { void e }
  try { res.removeHeader('Expires') } catch (e) { void e }

      // Add a minimal Content-Security-Policy with frame-ancestors (recommended over X-Frame-Options)
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'")

    const stream = fs.createReadStream(filePath)
    stream.on('error', (err) => { void err; res.statusCode = 500; res.end('Internal Server Error') })
    stream.pipe(res)
  } catch (e) { void e; res.statusCode = 500; res.end('Internal Server Error') }
})

server.listen(port, () => {
  console.log(`Preview server running at http://localhost:${port} serving ${root}`)
})
