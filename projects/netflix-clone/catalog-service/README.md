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

## Type safety (GraphQL Code Generator)

Resolvers are type-checked **against the schema**. [GraphQL Code Generator](https://the-guild.dev/graphql/codegen)
reads `src/schema/*.graphql` and emits TypeScript types into `src/generated/graphql.ts`; the
resolver map is typed with the generated `Resolvers` type, so field names, argument types, and
return types must match the SDL — change the schema and mismatches become compile errors.

```bash
npm run codegen        # generate src/generated/graphql.ts from the schema
npm run codegen:watch  # regenerate on schema change while developing
```

Config lives in [`codegen.ts`](codegen.ts). Key options: `mappers` (the schema `Show` maps to
the data-layer `data/shows.ts#Show` — see the entity-vs-DTO note in the site), `mapperTypeSuffix`
(imports it as `ShowMapper` to avoid a name clash), and `useTypeImports` (required by our strict
`verbatimModuleSyntax`).

> **We commit `src/generated/`** (it is *not* git-ignored) so a fresh clone runs without a codegen
> step. Trade-off: the generated file shows up in every PR diff, and can **drift** from the schema
> if someone edits `shows.graphql` without re-running `npm run codegen`. The alternative is to
> git-ignore it and add a `prestart`/`predev` codegen hook — revisit if drift becomes a problem.

---

## Type-check

```bash
npm run typecheck     # tsc --noEmit  (also validates resolvers against generated types)
```

---

## TODOs / revisit later

- **Add a production `build` step.** Today the server runs from source via `tsx` (`dev`/`start`),
  which transpiles on the fly and does **not** type-check at runtime. For a production-style run
  we'd add `"build": "tsc"` → emit to `dist/`, and start with `node dist/index.js`. Pieces are
  already in place (`tsconfig.json`, `dist/` git-ignored). Deferred until the deployment phase —
  not a current priority.

---

## Project layout

```
catalog-service/
  .npmrc                     # public npm registry (this folder only)
  package.json               # Apollo Server 4 + graphql; tsx + typescript + codegen (dev)
  tsconfig.json              # strict TS, ESM (NodeNext)
  codegen.ts                 # GraphQL Code Generator config (schema → TS types)
  src/
    schema/shows.graphql     # the SDL contract: type Show, enum ShowKind, Query.{shows,show}
    data/shows.ts            # fake in-memory data source (the swap-later seam); the "entity"
    resolvers/index.ts       # Query resolvers, typed with generated `Resolvers` (thin delegation)
    generated/graphql.ts     # GENERATED from the schema (committed); the API "DTO" types
    index.ts                 # loads SDL + resolvers, starts server + Sandbox on :4001
```
