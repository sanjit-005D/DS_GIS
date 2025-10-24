Production HTTP header recommendations

These headers are recommended for production deployments to avoid security and caching warnings.

Recommended headers (apply to all responses):

- Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
- X-Content-Type-Options: nosniff

Notes:
- Prefer `Cache-Control` instead of the older `Expires` header. If a CDN automatically injects `Expires`, override it.
- `X-Content-Type-Options: nosniff` prevents MIME-type sniffing and is recommended for static assets.

Headers to avoid or replace

- X-XSS-Protection
  - This legacy header is rarely useful on modern browsers. Scanners often recommend removing it; instead rely on a strong `Content-Security-Policy`.

- X-Frame-Options
  - Prefer `Content-Security-Policy: frame-ancestors 'self'` instead of `X-Frame-Options` for more consistent and flexible framing controls.


Additional checks you might see and how to address them

- Content-Type / charset
  - Ensure responses include a `Content-Type` header. For text resources (HTML/CSS/JS/JSON) the charset should be UTF-8, e.g. `Content-Type: text/html; charset=utf-8`.
  - Vite and static hosts normally set Content-Type automatically for files in `dist`. If you see a missing `Content-Type` header on a specific resource, verify the hosting configuration for that file and avoid overriding the header globally.

- Cache busting (asset URL fingerprinting)
  - Scanners may warn when a resource URL doesn't contain a hash or version marker (cache-busting). Vite's production build already emits hashed filenames for imported assets (e.g. `assets/logo.abc123.png`) when you `import` the asset from code. Example:
    ```js
    import logoUrl from './assets/logo.png'
    // use logoUrl in markup; the built file will be hashed
    ```
  - If you placed static files directly into `public/` (e.g. `/logo_log.jpg`), they will not be renamed by Vite. To get cache-busting for those files, import them from `src` (so they are processed by the build) or include a version suffix manually (e.g. `logo_log.v1.jpg`) and update links when you deploy.
  - Another option: configure your CDN to append fingerprint query strings or to add aggressive Cache-Control with `immutable` for truly static hashed assets.

- Set-Cookie / Expires warnings
  - If you see a `Set-Cookie` header with an invalid `Expires` date format, that originates from the server that sets the cookie (for example an auth provider). The `Expires` value must be in RFC 1123 format (example: `Fri, 24 Oct 2025 09:21:49 GMT`). Use `Date.prototype.toUTCString()` in server code to produce the correct format.
  - Prefer `Max-Age` over `Expires` where possible. `Set-Cookie: session=abc; Max-Age=3600; HttpOnly; Secure; SameSite=Lax` is recommended and avoids different date-format issues.
  - Also ensure your server does not send an `Expires` header for static assets if you control caching via `Cache-Control`.

Checklist to remediate common scanner warnings

- Ensure all responses from your production host include:
  - `Cache-Control` (explicit value tailored to asset type)
  - `X-Content-Type-Options: nosniff`
  - `Content-Type` with `charset=utf-8` for text types
- Use fingerprinted (hashed) asset filenames for cache busting. Move frequently changing assets out of `public/` and import them from `src/`.
- If your auth provider sets cookies with `Expires`, check that date formatting is RFC 1123; prefer `Max-Age`.


Examples

Netlify (add `public/_headers`):

```
/*
  Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
  X-Content-Type-Options: nosniff
```

Vercel (vercel.json):

```
{
  "headers": [
    {
      "source": "(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

Nginx (example):

```
location / {
  add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
  add_header X-Content-Type-Options "nosniff";
  try_files $uri $uri/ /index.html;
}
```

Express static server middleware (Node):

```js
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.static('dist'));
```

Local preview server

If you want to preview the production build locally with these headers, run `npm run build` and then:

```
npm run serve:preview
```

This will serve `./dist` with the recommended headers.
