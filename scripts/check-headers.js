#!/usr/bin/env node
// Simple header checker for local/dev preview servers
// Usage: node scripts/check-headers.js [url]

const http = require('http')
const https = require('https')
const url = require('url')

const target = process.argv[2] || 'http://localhost:5177/'

function fetchOnce(u) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(u)
    const lib = parsed.protocol === 'https:' ? https : http
    const opts = { method: 'HEAD', hostname: parsed.hostname, port: parsed.port, path: parsed.path }
    const req = lib.request(opts, (res) => {
      resolve({ url: u, status: res.statusCode, headers: res.headers })
    })
    req.on('error', reject)
    req.end()
  })
}

async function run() {
  try {
    console.log('Checking headers for', target)
    const results = []
    results.push(await fetchOnce(target))

    // also check common static paths
    const staticPaths = ['/', '/index.html', '/favicon.svg', '/vite.svg', '/src/main.jsx']
    for (const p of staticPaths) {
      try {
        const u = new URL(p, target).toString()
        results.push(await fetchOnce(u))
      } catch (e) {}
    }

    results.forEach(r => {
      console.log('\nURL:', r.url)
      console.log(' status:', r.status)
      console.log(' headers:')
      for (const k of Object.keys(r.headers)) {
        console.log('  ', k + ':', r.headers[k])
      }

      // quick checks
      const ct = r.headers['content-type'] || r.headers['Content-Type']
      if (!ct) console.warn('  -> WARNING: missing Content-Type header')
      else if (/(text|json|javascript|html)/i.test(ct) && !/charset=utf-8/i.test(ct)) console.warn('  -> WARNING: text content-type missing charset=utf-8')

      if (!r.headers['cache-control']) console.warn('  -> WARNING: Cache-Control header missing')
      if (!r.headers['x-content-type-options']) console.warn('  -> WARNING: X-Content-Type-Options header missing')
      if (r.headers['expires']) console.warn('  -> NOTICE: Expires header present (prefer Cache-Control instead)')
      if (r.headers['set-cookie']) console.warn('  -> NOTICE: Set-Cookie header(s) present:', r.headers['set-cookie'])
    })
  } catch (e) {
    console.error('Check failed', e)
  }
}

run()
