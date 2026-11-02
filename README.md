# Leafreader

A tiny static webnovel reader for **public-domain books**. MIT-licensed, no
server, no database, no accounts, no analytics, no build step, and no runtime
dependencies.

The demo library is imported from [Project Gutenberg](https://www.gutenberg.org/).
Everything is plain HTML, CSS, JavaScript, and JSON, so it runs equally well on
GitHub Pages, Cloudflare Pages, Netlify, Codeberg Pages, IPFS, or a Raspberry Pi.

> **Scope:** this project only ships public-domain texts or content you have
> explicit permission to publish. It is not a scraper for pirated novels. If you
> add a source adapter, keep it inside that boundary.

## Free, open source, and locked down

- **MIT licensed** — code can be audited, forked, and self-hosted.
- **No runtime dependencies** — no npm packages, no remote CDNs, no fonts, no
  analytics. The importer uses Python's standard library only.
- **No backend** — static files only, so there is no server to breach or patch.
- **Strict CSP** — `script-src 'self'`, `default-src 'none'`, no inline scripts,
  no framing, no form posts.
- **Security headers** — CSP, HSTS, `nosniff`, `Referrer-Policy`, and
  `Permissions-Policy` via `_headers` (Cloudflare/Netlify) and CloudFront.
- **Local-only data** — reading progress and theme live in `localStorage`; nothing
  is uploaded.

See [SECURITY.md](SECURITY.md) for the threat model and deployment guidance.

---

## Run it locally

No dependencies required. From this folder:

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>. You can also open `index.html` directly, but a local
server is needed for JSON fetches and the service worker.

Read a book at `read.html?book=alice-in-wonderland`, or just click a cover.

---

## Add books

The importer uses only the Python standard library and Project Gutenberg:

```bash
python3 scripts/import_gutenberg.py --id 2701
python3 scripts/import_gutenberg.py --id 11 --id 84 --id 132
```

- `--id` is a [Gutenberg ebook number](https://www.gutenberg.org/ebooks/). Repeat it to
  import several books in one run.
- The script writes `data/books/<slug>.json`, refreshes `data/catalog.json`, strips
  the Gutenberg header/footer, splits chapters, and records word counts.
- It identifies itself with a user agent and sleeps between requests. Please keep
  that behavior if you modify it.
- Metadata comes from the free [Gutendex](https://gutendex.com/) API. Curated
  titles, descriptions, years, genres, and cover hues for the demo books live in
  `OVERRIDES` at the top of the script — add your own there.

Chapters are detected from headings such as `CHAPTER I`, `Letter 1`, or `I. LAYING
PLANS`. If a book has no usable headings, the script falls back to roughly
3,500-word parts so the reader still works.

### Publishing content you have rights to

You can drop a JSON file into `data/books/` yourself and add an entry to
`data/catalog.json`. The shape is:

```jsonc
{
  "id": "my-book",
  "title": "My Book",
  "author": "Author Name",
  "year": "2026",
  "genres": ["Fantasy"],
  "description": "One or two sentences.",
  "hue": 150,
  "source": {
    "name": "Author-authorized",
    "url": "https://example.com/my-book",
    "license": "CC BY 4.0"
  },
  "chapterCount": 2,
  "wordCount": 1234,
  "chapters": [
    { "id": "ch-1", "title": "Chapter One", "paragraphs": ["First paragraph."], "words": 123 }
  ]
}
```

Keep `chapterCount` and `wordCount` reasonably accurate; the library uses them for
progress and sorting. The reader only needs `id`, `title`, `author`, `source`, and
`chapters`.

---

## What's included

| Feature | How it works |
| --- | --- |
| Library + search | Client-side filter over `data/catalog.json` |
| Genre filters and sorting | No query strings sent anywhere |
| Chapter reader | Fetches one book JSON lazily |
| Progress + continue reading | `localStorage` only |
| Theme + font size | `localStorage` only |
| Offline support | Service worker caches the shell and visited chapters |
| Installable app | `manifest.webmanifest` + SVG icon |
| Security headers | CSP, HSTS, `nosniff`, frame/referrer/permissions policy |
| Zero dependencies | No npm, no pip, no build step |

Keyboard shortcuts in the reader: `←` / `→` for previous/next chapter, `Esc` to
close the mobile contents drawer.

---

## Hosting: what is actually $0

| Option | Monthly cost | Card required | Permanence |
| --- | --- | --- | --- |
| **GitHub Pages** | **$0** | No | Free within fair-use limits |
| **Cloudflare Pages** | **$0** | No | Free tier |
| **Netlify** | **$0** | No | Free tier |
| **Codeberg Pages** | **$0** | No | Free for FOSS projects |
| **IPFS + public gateway** | **$0** | No | Only while the CID is pinned |
| AWS S3 + CloudFront | "free tier" | Yes | Credits/trial terms change |
| ENS name | ~$5+/year + gas | Yes | Only while renewed |
| Custom domain | ~$10+/year | Yes | Only while renewed |

**Absolutely free and stable:** GitHub Pages or Cloudflare Pages, using their
subdomain. **Absolutely free but availability-dependent:** IPFS with a pinned CID.
**Not absolutely free:** AWS free trials and ENS names. No setup can combine a
permanent human-readable decentralized name with a guaranteed $0 bill.

### GitHub Pages (recommended, $0, no card)

```bash
cd leafreader
git init
git add .
git commit -m "Leafreader: static public-domain reader"
gh repo create leafreader --public --source=. --push
```

Then in the repository: **Settings → Pages → Build and deployment → Source:
Deploy from a branch → `main` / `(root)`**. The site appears at
`https://<your-user>.github.io/leafreader/`.

No `gh`? Create the repo in the browser, then:

```bash
git remote add origin https://github.com/<your-user>/leafreader.git
git branch -M main
git push -u origin main
```

Enable Pages in the repository settings. The included `.nojekyll` file tells
GitHub Pages to serve the files as-is.

### Cloudflare Pages ($0, no card, custom headers)

1. Push the folder to GitHub/GitLab.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Framework preset: **None**. Build command: **empty**. Output directory: **/**.
4. Deploy.

Cloudflare Pages reads [`_headers`](_headers), so the site gets real CSP/HSTS
response headers instead of only the `<meta>` fallback.

### Netlify ($0)

Drag the folder onto <https://app.netlify.com/drop>, or connect the repo with an
empty build command and publish directory `.`. Netlify also applies `_headers`.

### Other free options

- **Codeberg Pages** — free for free/open-source projects.
- **GitLab Pages** — free tier with CI.
- **Neocities** — free static hosting with a small storage limit.
- **Your own machine** — `python3 -m http.server` on a LAN, or a Raspberry Pi.

### AWS free tier (optional, not guaranteed $0)

If you specifically want AWS, [`deploy/aws/`](deploy/aws/README.md) contains a
CloudFormation template and one-command deploy script for **private S3 +
CloudFront over HTTPS**, including a response-headers policy with CSP/HSTS. It
avoids Route 53, ACM, EC2, and every other paid resource. But free trials require
a card, expire, and can bill overages. Set the included budget alarm and read the
current AWS Free Tier terms before using it.

### Decentralized address (optional, not guaranteed free)

[`deploy/ipfs/`](deploy/ipfs/README.md) publishes the same static files to IPFS
and walks through pointing an ENS name at the CID. IPFS publishing itself is
free. A permanent ENS name is not: registration and gas are paid. Public gateways
are a convenience layer, not pure decentralization.

### Free-path cost breakdown

| Item | Cost |
| --- | --- |
| Hosting (GitHub Pages / Cloudflare Pages) | $0 |
| Domain (`*.github.io` / `*.pages.dev`) | $0 |
| Database | $0 (JSON files in the repo) |
| Backend | $0 (none) |
| APIs | $0 (build-time Gutenberg/Gutendex only) |
| TLS | $0 (included by host) |
| **Total** | **$0/month** |

A custom domain or ENS name is the only optional cost, and neither is required.

---

## Project layout

```text
leafreader/
├── index.html                 # library, search, about
├── read.html                  # reader shell
├── manifest.webmanifest       # installable PWA metadata
├── sw.js                      # offline cache
├── assets/
│   ├── app.js                 # library logic
│   ├── reader.js              # chapter rendering + progress
│   ├── store.js               # localStorage helpers
│   ├── theme-init.js          # no-flash theme bootstrap
│   ├── style.css              # all styling, light + dark
│   └── icon.svg
├── data/
│   ├── catalog.json           # every book's summary
│   └── books/<slug>.json      # chapters + paragraphs
├── scripts/
│   └── import_gutenberg.py    # stdlib-only public-domain importer
├── deploy/
│   ├── aws/                   # CloudFormation + S3/CloudFront deploy script
│   └── ipfs/                  # IPFS publish script + ENS notes
├── _headers                   # CSP/HSTS/security headers (Cloudflare, Netlify)
├── SECURITY.md                # threat model and hardening notes
├── .nojekyll                  # GitHub Pages: disable Jekyll
├── LICENSE                    # MIT (code)
└── README.md
```

---

## Notes and limits

- **Public domain varies by country.** Project Gutenberg texts are public domain in
  the US. Check the rules where you plan to publish.
- Search covers titles, authors, genres, and years; it does not index full text.
  Full-text search would need a prebuilt index or a backend, which would break the
  zero-cost/static model.
- Reading progress is per-browser. There is no sync between devices without adding
  a backend or a sync service.
- The free-tier hosts have soft bandwidth limits. A text-only site is tiny: the five
  demo books total a few megabytes, and chapters load on demand.
- If you outgrow static hosting, add a CDN or split the data; you still do not need
  a server for the reader itself.

## License

Code: MIT. Imported texts retain their original public-domain status and are
attributed to Project Gutenberg in each book's metadata. Project Gutenberg is a
registered trademark of the Project Gutenberg Literary Archive Foundation; this
project is not affiliated with it.
