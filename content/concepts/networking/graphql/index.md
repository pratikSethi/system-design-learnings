---
title: GraphQL
---

A query language for APIs where the **client** specifies exactly what data it wants, and a
single request can pull from many backends. Paired here with **federation** — the way large
orgs (Netflix, etc.) run one graph across many independently-owned services.

{{< callout type="info" >}}
This note grows alongside a hands-on project in the repo:
`projects/netflix-clone/` — a federated Netflix-style graph built one subgraph at a time
(Catalog first, then Reviews, then a Router). Diagrams below map 1:1 to what we build.
{{< /callout >}}

## The shape of a production GraphQL system

Before any syntax, the big picture. A client (phone, TV, web) sends **one** GraphQL query.
It rides HTTP through the edge and an API gateway to a **router**, which owns the combined
("federated") schema. The router figures out which backend services own which fields, fans
the query out to them, and stitches the results back into one response.

![High-level architecture: phone/TV/web clients send one GraphQL query through CDN and API gateway to a federated GraphQL router, which fans out planned sub-queries to Catalog, Reviews, and Users subgraphs, each owning its own data source; caching happens at every hop](architecture-overview.svg)

*The whole system at a glance. We build it right-to-left: first a single Catalog subgraph, then Reviews extending it, then the Router in front.*

The one idea to hold onto:

> The client sees **one** schema and sends **one** request. Each field is resolved by the
> team that owns it. GraphQL is a **composition / presentation layer** — the real data
> lives in services behind it (gRPC/REST + databases).

## Where GraphQL fits in a microservices architecture

The natural question once you see the diagram: *does every service become a GraphQL
subgraph, and does all service-to-service traffic now route through the router?* **No on
both counts** — and getting this right is most of the intuition.

### A subgraph is a *domain boundary*, not a microservice

The dividing line for "should this be a subgraph?" is **not** client-facing vs internal.
It's:

> **Does this service own data/fields that belong in the client-facing graph?**

And crucially:

> A subgraph is a **domain boundary, not necessarily one microservice**. A domain (say
> Catalog) may be backed by **several** internal microservices, with **one** subgraph in
> front exposing the slice of them that clients need. So it's not "every client-facing
> service is its own subgraph" — it's "each domain publishes **one** subgraph, which may
> sit atop many services."

So the graph is a **shallow aggregation layer** — a handful of domains (Catalog, Reviews,
Users, maybe Search) publish subgraphs, each fronting a whole domain.

### The router is a front door, not a service bus

The router does exactly one job: take a client query, split it across the subgraphs that
own the requested fields, stitch the results. It is **not** a general message bus. Backend
services still talk to each other **directly** — gRPC, REST, events — for everything that
isn't "a client asked for these fields."

```text
CLIENT-DRIVEN (through the router):        SERVICE-TO-SERVICE (direct, no router):
  client → router → Catalog subgraph         Playback ──gRPC──► Licensing
                 └→ Reviews subgraph          Recommendations ──gRPC──► Catalog
                                              Billing ──event──► Notifications
```

Routing internal calls through the router would add a latency + failure hop on the client
critical path, force internal calls through the *public* schema shape, and couple every
interaction to the router's availability. So **gRPC service-to-service traffic doesn't go
away** — it stays peer-to-peer (mesh territory: the L4/L7 balancing, xDS, deadlines from
the [gRPC note](../grpc/)). gRPC lives in two places: the subgraph speaks GraphQL *upward*
to the router, and often gRPC *sideways/downward* to peer services and its own data.

### The iceberg: what stays internal

The graph is a thin slice near the top; most services sit below it and never see a client
query. For a Netflix-shaped app:

- **Behind a subgraph** (a resolver calls these over gRPC): licensing / DRM rights, the
  encoding/transcoding pipeline, personalization & ranking (ML), artwork selection.
- **Never near the graph** (own data planes): Open Connect CDN (serves the actual video
  bytes), playback session / adaptive-bitrate control, the telemetry & event pipeline
  (billions of QoE events), the data/ML training platform, billing & payments,
  experimentation, fraud detection.

Some client paths also **bypass the graph entirely**: the video bytes come from the CDN
(GraphQL only hands back the manifest/URLs), and playback telemetry is fire-and-forget
events — not graph mutations. The graph is for **structured, read-heavy, aggregation-shaped**
client data, where "give me exactly these fields across these domains in one trip" is the win.

{{< callout type="info" >}}
**Why this matters:** federation unifies the *few* client-facing domains without forcing
the deep iceberg of internal services into one schema. GraphQL federation and a large
internal gRPC/event fabric coexist by design.
{{< /callout >}}

## One client query → many downstream calls

_(draft — captured while fresh; refine when we build step 3)_

A **single** client query hitting a **single** subgraph can explode into many downstream
calls (gRPC / HTTP / SQL). Two multipliers stack:

**1. Breadth — fields fan out to different backends.** One `Show` may need several services;
each field's resolver makes its own call. This is expected — it's the aggregation GraphQL
exists to do (the client would've made these calls itself over REST anyway).

```text
query { show(id:"1") { title  boxArt  availability  bingeScore } }
                        │       │        │             │
                        DB    Artwork   Licensing    Ranking/ML
```

**2. Depth × cardinality — the N+1 problem (the dangerous one).** A **list** field where a
per-item resolver runs once per element:

```text
query {
  shows(first: 20) {     # 1 call  → getShows(limit: 20)
    title
    cast { name }        # runs ONCE PER SHOW → 20 calls → getCastForShow(showId)
  }
}
# → 1 + 20 = 21 calls for what should be 2
```

### Why N+1 happens: normalization

The `cast` resolver runs independently for each of the 20 shows and, on its own, doesn't
know the other 19 are also asking. But the *root cause* is *why* a second call is needed at
all: **related data lives behind a reference (an id), not embedded.**

- The Catalog DB stores `Show { title, castIds: [42, 87] }` — just **pointers**. The real
  person records (name, photo, bio) live in a **People/Talent service**, because cast is
  shared across thousands of titles and you don't duplicate an actor's bio into every show.
  So the fetched `Show` has no cast objects — resolving `cast { name }` means calling People
  per show.
- Same shape **inside one DB** with a naive ORM: `SELECT … FROM shows LIMIT 20` (1), then a
  lazy `show.cast` fires `SELECT … WHERE show_id = ?` **per row** (20).
- A `Show` *would* already contain its cast only if **denormalized/embedded** (e.g. a doc
  store nesting the full cast) — but that trades N+1 for duplication, and you hit N+1 again
  the moment you ask for a field the embedded copy lacks (`cast { awards }`).

> N+1 comes from **normalization** — related data sits behind an id, so fetching it for a
> list means one lookup per item. GraphQL doesn't cause this; it makes deeply-nested data
> easy to *request*, surfacing the N+1 that was always there.

### The fix: DataLoader (batch + dedupe per request)

Resolvers **register** the id they need; a loader collects them within a tick and makes
**one batched** call — and caches within the single request, so a person needed by two
fields is fetched once.

```text
20 resolvers ask for cast[1..20]  ──(batched in one tick)──►  ONE call: getCastForShows([1..20])
                                                              21 calls → 2
```

So the fix is **batching**, not "embed everything." This is why these roadmap topics
cluster: **resolvers → N+1 → DataLoader → complexity limits** are all facets of "one query,
many downstream calls."

### The honest tradeoff

GraphQL doesn't *remove* the complexity of fetching from many places — it **relocates** it.
The client's job gets simpler (one request, exactly the fields it wants); in exchange the
**server** inherits a potential explosion of downstream calls.

> The fan-out moves from the **client's network** (many internet round-trips) to the
> **server's network** (many datacenter calls). Usually a good trade — datacenter calls are
> fast and parallel, and the client over a flaky mobile link is the worse place to do N
> round-trips — **but** the complexity doesn't vanish, it lands on the backend as call
> proliferation. So **batching (DataLoader) and cost/depth limits aren't optional at scale**;
> they're what keep the relocated complexity from becoming an outage.

Defenses: DataLoader (batch N+1), query **depth/complexity limits** (reject an exploding
query before running it), **pagination** (never unbounded lists), and **per-backend
timeouts** (one slow downstream can't hang the whole query).

## Core concepts

_(sections filled in as the project progresses — this is the map)_

- **Schema & types** — the type system (SDL), `Query`/`Mutation`/`Subscription` roots, scalars, objects, enums, interfaces, unions.
- **Resolvers** — the function behind every field; how a query tree resolves; `context` (auth, loaders); why a resolver is *thin delegation*, not business logic.
- **Over- / under-fetching** — the REST problem GraphQL targets: one round-trip, exactly the fields asked for.
- **The N+1 problem & DataLoader** — the sharp edge; per-request batching + caching.
- **Pagination** — offset vs cursor; the Relay **connections** spec (`edges`/`node`/`pageInfo`).
- **Errors** — partial success (`data` + `errors`), error masking, and why HTTP is usually `200`.

## Federation (the endgame)

- **Why federate** — one graph, many teams shipping independently; no monolithic schema, no central resolver bottleneck.
- **Subgraphs** — each service publishes its slice of the schema + resolvers + data.
- **Entities & `@key`** — a type one subgraph *owns* and others *extend* (Reviews adds `reviews` to Catalog's `Show`).
- **The Router** — query planning, `_entities` resolution, fetching across subgraphs.
- **Composition: build-time vs runtime** — schema registry, composition checks in CI, breaking-change detection; why build-time composition is the industry-standard safety net.
- **Netflix's approach** — the DGS (Domain Graph Service) framework + federation. _(cited below)_

## Production concerns

The topics that separate "I built a GraphQL server" from "I run one at scale":

- **Caching (multi-layer)** — client normalized cache · CDN/edge · **Automatic Persisted Queries (APQ)** · router response cache + `@cacheControl` · per-request DataLoader.
- **Security** — query **depth** & **complexity/cost** limits · **persisted-query safelisting** · disabling introspection in prod · field-level authorization in `context` · rate limiting.
- **Performance** — DataLoader batching · avoiding resolver waterfalls · `@defer`/`@stream` · projection push-down to data sources.
- **Reliability & ops** — partial errors & masking · timeouts/retries per subgraph · **observability** (per-resolver tracing, OpenTelemetry, Apollo traces).
- **Schema evolution** — additive-only changes · `@deprecated` (no versioned URLs like REST) · composition checks to block breaking changes.
- **Realtime** — **subscriptions** (WebSocket / SSE); see the [realtime family](../) in networking for transport tradeoffs.

## GraphQL vs REST vs gRPC

_(comparison table — to be written)_ Short version: **gRPC** for internal service-to-service
(binary, typed, fast); **REST** for simple public resources; **GraphQL** for a
**client-facing aggregation layer** over many backends where clients need flexible,
precise fetching. They compose — a GraphQL resolver often calls a gRPC service.

## Talks & deeper resources

_(cited by title/speaker/venue; verify the exact URL before relying on it)_

- Official docs — [graphql.org/learn](https://graphql.org/learn/) · [Apollo Federation docs](https://www.apollographql.com/docs/federation/)
- **Netflix** — *How Netflix Scales its API with GraphQL Federation* — Netflix Technology Blog. _(verify)_
- **DataLoader** — [github.com/graphql/dataloader](https://github.com/graphql/dataloader) — the batching pattern, from Facebook.

## Quick self-check (recall from memory)

1. Client sends one query for a show's title **and** its reviews — how does the router get both when two different teams own them?
2. What exactly is the N+1 problem in a resolver, and how does DataLoader fix it?
3. Why is a GraphQL resolver "thin"? What lives behind it in production?
4. Where can a GraphQL response be cached, and what makes caching harder than REST?
5. Build-time vs runtime schema composition — what does the build-time check protect you from?
