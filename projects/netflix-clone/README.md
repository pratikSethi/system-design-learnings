# netflix-clone

A hands-on, **learn-by-building** project: incrementally build a Netflix-style backend to
learn system-design topics for real, one small piece at a time. It's open-ended — new areas
(auth, caching, more services…) get added as chapters over time.

**Current chapter: GraphQL + TypeScript from scratch**, built toward **GraphQL federation** —
the way large orgs (Netflix, etc.) run one graph across many independently-owned services.
That's the focus of everything below for now.

Companion notes live in the site at
[`content/concepts/networking/graphql`](../../content/concepts/networking/graphql/) — this
README is the *build log*; the notes are the *concepts*.

## Why Netflix-shaped?

It gives a natural federation story: a few client-facing **domains** (Catalog, Reviews,
Users) each become a **subgraph**, and a **router** stitches them into one graph a phone / TV
/ web client can query in a single request. We start with one domain and grow.

## Guiding decisions

- **Schema-first (SDL).** Write the `.graphql` contract, then resolvers against it. Federation
  directives (`@key`, `@external`) live naturally in SDL. (Not code-first/Pothos.)
- **Pattern B — GraphQL lives *inside* each domain service** (like Netflix's DGS), not as a
  thin translation layer in front of it. So each service *is* a subgraph.
- **Production-style layout** — schema / resolvers / data-source separated, so the
  "swap the fake data for a real backend" seam is there from day 1.
- **Ports:** catalog `4001`, reviews `4002`, router `4000`.

## Roadmap — GraphQL chapter (one concept per step)

| Step | What we build | Concept learned | Status |
|---|---|---|---|
| **1** | `catalog-service`: `shows` query → fake in-memory data + Apollo Sandbox playground | schema, resolver, how a query resolves | ✅ done |
| **2** | `show(id)` query (arguments) + **GraphQL Code Generator** for end-to-end type safety | field arguments; schema-derived TS types (no drift) | ✅ done |
| **3** | Async data source + a `cast` field → the **N+1 problem**, then **DataLoader** | resolver = thin delegation; N+1, batching, per-request `context`; joins as an alternative | ✅ done |
| **4** | Add a `reviews` subgraph that references `Show`, put an **Apollo Router** in front | **federation** — `@key`, entity resolution, `rover` composition | ✅ done |
| **5** | Build-time vs runtime composition; schema registry + composition/breaking-change checks | federation **tooling** & why it's the industry standard | ⬜ planned |

## Future chapters (rough, not committed)

Once the GraphQL chapter matures, likely directions — added incrementally as learning goals,
each with its own concept focus: **auth** (authn/authz in `context`, field-level authz),
**caching** layers, **observability/tracing**, more domains (Users, Search), realtime
(subscriptions). Deliberately loose — the point is to learn by building, not to pre-plan it all.

## Companion diagrams (custom SVG, in the notes)

1. ✅ **High-level device→data** — clients → CDN → gateway → router → subgraphs → data.
2. ✅ **Zoom: inside the Catalog subgraph** — resolver → DataLoader → backend (N+1 vs batched).
3. ⬜ **Zoom: federation entity resolution** — router → `_entities` → `__resolveReference` across subgraphs.

## Services

| Service | Domain | Port | Status | README |
|---|---|---|---|---|
| `catalog-service` | owns `Show` (title, cast, …) | 4001 | active | [catalog-service/README.md](catalog-service/README.md) |
| `reviews-service` | contributes `reviews` / `averageRating` to `Show` | 4002 | active | — |
| Apollo Router (via `rover dev`) | composes both subgraphs into one graph | 4000 | active | — |

Node projects here use the **public npm registry** via a project-local `.npmrc` (the machine's
global npm may point at a private registry).

## Running the federated graph

You need **three terminals**: one per subgraph, plus the router.

### One-time: install the Rover CLI

`rover` is Apollo's CLI — it composes the subgraphs and runs the real Apollo Router (Rust)
locally. It's a global tool, not a project dependency:

```bash
npm install -g @apollo/rover --registry=https://registry.npmjs.org/
# (--registry override is a one-time flag; it does NOT change your global npm config)
```

### 1 + 2. Start the subgraphs (terminals 1 & 2)

```bash
cd catalog-service && npm install && npm run dev     # 🎬 http://localhost:4001/
cd reviews-service && npm install && npm run dev     # ⭐ http://localhost:4002/
```

Each subgraph is a standalone GraphQL server (`buildSubgraphSchema`) exposing the federation
`_service` / `_entities` fields the router uses. A subgraph on its own has **no browsable
top-level query for its contributed fields** — e.g. reviews' `reviews` field hangs off the
`Show` entity, reached via `_entities`. That's expected; the router is what exposes the real
`Query`.

### 3. Compose + run the router (terminal 3)

From the `netflix-clone/` root, with both subgraphs already up:

```bash
rover dev --supergraph-config supergraph.yaml --supergraph-port 4000
# first run downloads the Apollo Router binary; accept the license with
# APOLLO_ELV2_LICENSE=accept if prompted in a non-interactive shell
```

`rover dev` reads [`supergraph.yaml`](supergraph.yaml), polls each subgraph's schema, **composes**
them into one supergraph, and runs the Apollo Router at **http://localhost:4000/** — recomposing
automatically when a subgraph's schema changes.

## Testing as a real client

Open **http://localhost:4000/** (Apollo Sandbox) — this is the single endpoint a phone/TV/web
client would use. It has no idea two services are behind it. Paste:

```graphql
query HomeScreen {
  shows {
    title          # from catalog
    kind           # from catalog
    cast { name }  # from catalog
    reviews {      # from reviews (different service!)
      rating
      comment
    }
    averageRating  # from reviews
  }
}
```

One request, fields stitched from **both** subgraphs. `title`/`kind`/`cast` come from catalog;
`reviews`/`averageRating` from reviews — the router plans the fan-out and joins the results by
the `Show` `@key`. (Glass Onion has no reviews → `reviews: []`, `averageRating: null`.)

CLI equivalent:

```bash
curl -s http://localhost:4000/ -H 'content-type: application/json' \
  -d '{"query":"{ shows { title reviews { rating } averageRating } }"}' | jq
```
