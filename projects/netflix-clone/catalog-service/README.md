# catalog-service

The **Catalog subgraph** for the Netflix-clone GraphQL learning project. Step 1: a single
GraphQL service that owns `Show` and answers one query, `shows`. Schema-first (SDL), with
a fake in-memory data source standing in for a real backend.

```
client ──GraphQL/HTTP──▶ Apollo Server ──▶ resolver ──▶ data/shows.ts (fake "DB") ──▶ back
```

- **Owns:** the `Show` type (+ `ShowKind` enum)
- **Query:** `shows: [Show!]!`
- **Listens on:** `http://localhost:4001/` (reviews → 4002, router → 4000 in later steps)
- **Contract:** [`src/schema/shows.graphql`](src/schema/shows.graphql)

> Named a *subgraph* from day 1 even though it runs standalone — later steps add a Reviews
> subgraph and a Router in front to make it a real federated graph.

---

## Prerequisites

- Node.js 20+ and npm.
- A project-local [`.npmrc`](.npmrc) points npm at the **public** registry (the machine's
  global `~/.npmrc` targets Amazon-internal CodeArtifact). It's scoped to this folder and
  does not modify the global config.

First-time setup (installs deps into `node_modules/`):

```bash
npm install
```

---

## Start / stop the server

```bash
# from projects/netflix-clone/catalog-service

npm run dev     # START with auto-reload on file changes (tsx watch)
npm start       # START once, no watch

# STOP (find + kill whatever listens on 4001)
kill $(lsof -ti :4001)

# CHECK whether it's running (empty output = not running)
lsof -iTCP:4001 -sTCP:LISTEN
```

On startup it prints: `🎬 catalog-service ready at http://localhost:4001/`

---

## Playground (Apollo Sandbox)

Open **http://localhost:4001/** in a browser. Apollo Sandbox is the in-browser IDE:

- **Schema / Documentation** panel — browse every type and the available queries.
- Autocomplete as you type a query; click fields to build one.
- Ask for *only* the fields you want — the response contains *only* those. That's GraphQL's
  no-over-fetching in action.

### Sample queries

```graphql
# every show, a few fields
{ shows { id title kind releaseYear } }

# ask for only the title — response has only titles
{ shows { title } }
```

### From the CLI (curl)

```bash
curl -s http://localhost:4001/ -H 'content-type: application/json' \
  -d '{"query":"{ shows { id title kind releaseYear maturityRating } }"}'
```

---

## Type-check

```bash
npm run typecheck     # tsc --noEmit
```

---

## Project layout

```
catalog-service/
  .npmrc                     # public npm registry (this folder only)
  package.json               # Apollo Server 4 + graphql; tsx + typescript (dev)
  tsconfig.json              # strict TS, ESM (NodeNext)
  src/
    schema/shows.graphql     # the SDL contract: type Show, enum ShowKind, Query.shows
    data/shows.ts            # fake in-memory data source (the swap-later seam)
    resolvers/index.ts       # Query.shows → findAllShows()  (thin delegation)
    index.ts                 # loads SDL + resolvers, starts server + Sandbox on :4001
```
