# CLAUDE.md

Guidance for Claude/agent sessions working in this repo.

## What this repo is

Personal **system design learning** material by Pratik Sethi. Two distinct halves:

- `content/` — **notes**, published as a website (Hugo + Hextra). This is the learning material.
- `projects/` — **runnable code** for hands-on projects (e.g. a gRPC service). **Never** part of the website; Hugo ignores it.

The site deploys to GitHub Pages at `https://pratiksethi.dev/system-design-learnings/`
(subpath behind the user's Cloudflare-fronted domain; the root domain is a separate Hugo
blog and is unrelated to this repo).

## ⚠️ Hard-won rules (read before editing the site)

- **Author in Markdown only. Do NOT hand-edit HTML/CSS or override theme layouts/partials.**
  A past session burned a lot of effort adding footnote CSS and a footer layout override —
  both caused cross-page breakage and were fully reverted. The theme owns styling; content
  is Markdown. If a theme default looks off, prefer a **config** change (`hugo.toml`) or
  leave it; treat any layout/CSS override as a risky, separately-tested task, not a casual edit.
- **`themes/hextra/` is a git submodule — never edit files inside it.** Changes get lost on
  theme update and won't deploy.
- Keep the repo **fully stock Hextra** unless the user explicitly asks to customize.

## Writing conventions (notes)

- **Expand every abbreviation on first use**, short form in parens, then use short form
  freely (e.g. "Interface Definition Language (IDL)").
- **Section landing pages surface only ready content.** Roadmap/aspirational items and
  unattached reference links go in a collapsed `{{< details title="Planned topics" closed="true" >}}`
  block, moved out as pages are written.
- **Cross-cutting techniques** (hedging, backoff, circuit breakers…) get their own section
  (e.g. `content/concepts/reliability/`), not buried in one technology's page — the tech
  page cross-links to them.
- Cite talks/papers by **title + speaker + venue**; mark unverified URLs _(verify)_.

## Content structure (Hugo page bundles)

Each concept is a **page bundle**: a folder with `index.md`. URL = folder path (no `.html`,
no `index`). Example:

```
content/concepts/networking/grpc/
  index.md                → /concepts/networking/grpc/
  grpc-overview.png        → colocated image, referenced by bare filename in index.md
```

- **Images:** page-specific screenshots live *in the page bundle*, linked by bare filename
  (`![...](grpc-overview.png)`). Attribution goes in a one-line italic caption + a link in
  the page's "resources" list.
- Section landing pages are `_index.md`; sub-topics are `<topic>/index.md`.

## Running things

Site (from repo root):
```bash
hugo server --port 1313 --baseURL http://localhost --appendPort=true   # local preview
hugo --gc --minify                                                      # production build
```
Deploy is automatic via `.github/workflows/deploy.yml` on push to `main` (GitHub Pages,
Actions source). The workflow injects the correct `--baseURL` subpath.

gRPC message-service (from `projects/slack-clone/message-service/`):
```bash
uv run python -m message_service.server           # start (port 50051)
kill $(lsof -ti :50051)                            # stop
```
See that project's own `README.md` for grpcurl/Bruno test payloads. Python projects here
use **uv** + **Python 3.12+**.

## Current state

- Written notes: `concepts/networking/grpc`, `concepts/reliability/{reliability-vs-availability,request-hedging}`.
- Project: `projects/slack-clone/message-service` (unary SendMessage/GetMessages over gRPC → SQLite).
