# Security

Leafreader is a static site. There is no backend, no database, no login, no
cookie, and no analytics. That removes most of the usual attack surface, but the
remaining pieces still deserve care.

## Design boundaries

- **No third-party runtime code.** No CDN scripts, no remote fonts, no tag
  managers, no analytics. Everything is served from the same origin.
- **No build step or dependencies.** There is no `node_modules`, no package
  manager lockfile to compromise, and no server process to patch.
- **Content is data, not code.** Chapters are rendered with HTML escaping
  (`textContent`-equivalent escaping before insertion). A malicious chapter file
  can add text, not script. Book metadata links are limited to `http(s)` URLs
  before being assigned to an anchor.
- **Progress and preferences stay local.** `localStorage` only. Nothing is sent
  anywhere.
- **Strict CSP.** `script-src 'self'` (no inline scripts), `object-src` disabled
  through `default-src 'none'`, no framing, no form posts.
- **HTTPS everywhere.** Use a host that provisions TLS (GitHub Pages, Cloudflare
  Pages, Netlify, S3 + CloudFront). `_headers` adds HSTS and related headers on
  hosts that support it.

## Headers

`_headers` (Cloudflare Pages / Netlify) sets:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` (camera, microphone, geolocation, payment, USB disabled)
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`
- `Strict-Transport-Security`

GitHub Pages cannot set response headers, so `index.html` and `read.html` also
carry a `<meta http-equiv="Content-Security-Policy">` fallback. Meta CSP cannot
enforce `frame-ancestors`; if clickjacking is a concern, use a host that supports
the header.

The AWS stack attaches a CloudFront response headers policy with the same rules.

## Threat model

| Risk | Mitigation |
| --- | --- |
| XSS through imported text | All book fields are HTML-escaped before rendering |
| Supply-chain compromise | No npm/pip runtime dependencies; importer is stdlib-only |
| Tracking / data harvesting | No third-party requests, no cookies, no accounts |
| Clickjacking | `frame-ancestors 'none'` / `X-Frame-Options: DENY` |
| MIME confusion | `nosniff`; explicit `Content-Type` on deploy |
| Stale service worker | `no-cache` on `sw.js`; versioned cache |
| Malicious pull request | Static review; content changes are visible JSON diffs |

## Deploying safely

- Keep the bucket private (the AWS template does) and serve through CloudFront.
- Do not add `unsafe-eval` to the CSP.
- Do not add third-party embeds without updating the CSP deliberately.
- If you accept user-submitted books, treat the JSON as untrusted, validate its
  shape, and keep escaping in place. There is no server-side sandbox because
  there is no server.
- Pin import sources. The importer fetches Project Gutenberg over HTTPS; review
  `scripts/import_gutenberg.py` before changing URLs or adding sources.

## Reporting

Open an issue in the repository with reproduction steps. Do not include secrets,
API keys, or private data. There is no bug bounty and no guaranteed response
time; this is a volunteer, zero-budget project.

## A note on content rights

Security and legality are separate. This project ships public-domain works only.
Adding copyrighted text without permission is out of scope and is not made safe
by any technical control here.
