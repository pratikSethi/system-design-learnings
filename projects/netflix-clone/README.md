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
| **3** | Swap the fake array for a real data source (gRPC/REST backend) | resolver = thin delegation; the **N+1 problem** + **DataLoader** | ⬜ planned |
| **4** | Add a `reviews` subgraph that `extend`s `Show`, put a **Router** in front | **federation** — `@key`, entity resolution, schema composition | ⬜ planned |
| **5** | Build-time vs runtime composition; schema registry + composition/breaking-change checks | federation **tooling** & why it's the industry standard | ⬜ planned |

## Future chapters (rough, not committed)

Once the GraphQL chapter matures, likely directions — added incrementally as learning goals,
each with its own concept focus: **auth** (authn/authz in `context`, field-level authz),
**caching** layers, **observability/tracing**, more domains (Users, Search), realtime
(subscriptions). Deliberately loose — the point is to learn by building, not to pre-plan it all.

## Companion diagrams (custom SVG, in the notes)

1. ✅ **High-level device→data** — clients → CDN → gateway → router → subgraphs → data.
2. ⬜ **Zoom: inside the Catalog subgraph** — resolver → DataLoader → backend → DB (build at step 3).
3. ⬜ **Zoom: federation entity resolution** — `Show @key` + Reviews `extend`, as an "iceberg"
   (graph layer on top, internal gRPC services below) (build at step 4).

## Services

| Service | Domain | Port | Status | README |
|---|---|---|---|---|
| `catalog-service` | owns `Show` | 4001 | active | [catalog-service/README.md](catalog-service/README.md) |
| `reviews-service` | extends `Show` with reviews | 4002 | planned | — |
| `router` | composes subgraphs into one graph | 4000 | planned | — |

Each service has its own README with run/test instructions. Node projects here use the
**public npm registry** via a project-local `.npmrc` (the machine's global npm may point at a
private registry).

## Running (current state)

```bash
cd catalog-service
npm install
npm run dev        # http://localhost:4001/  → Apollo Sandbox playground
```

See [catalog-service/README.md](catalog-service/README.md) for queries and CLI (curl/jq) usage.
