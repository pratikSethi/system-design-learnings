---
title: GraphQL
---

A query language for APIs where the **client** specifies exactly what data it wants, and a
single request can pull from many backends. This note starts from the basics and builds up to
**federation** — the way large orgs (Netflix, etc.) run one graph across many
independently-owned services.

## What is GraphQL, and why does it exist?

GraphQL came out of **Facebook (2012, open-sourced 2015)**. The problem it targeted: their
mobile apps were making **many REST calls** to paint a single screen, over slow, unreliable
mobile networks — and each call returned **more data than the screen needed**. Two classic
pains of REST:

- **Under-fetching** — one endpoint doesn't have everything a screen needs, so the client
  makes *several* round-trips and stitches the results together.
- **Over-fetching** — an endpoint returns a *fixed* payload, usually more fields than this
  particular screen uses. Wasted bytes on the wire.

Picture a Netflix-style home screen with three sections — **profile**, **top shows**,
**recommendations** — each owned by a different service:

![Before vs after GraphQL: on the left, a client makes 3 separate REST round-trips over the slow public internet, each returning a full fixed payload (under-fetch + over-fetch); on the right, the client makes 1 GraphQL request over the internet asking for exact fields, and the GraphQL layer (a backend-for-frontend) fans out to Profile, Top Shows, and Recommendations services inside the fast datacenter/VPC](rest-vs-graphql.svg)

*Left: 3 round-trips over the slow leg, each over-fetching. Right: 1 request for exactly the fields needed; the fan-out moves inside the datacenter.*

**With GraphQL, the client sends one request for exactly the fields it needs.** Behind the
scenes, GraphQL acts as a **backend-for-frontend (BFF)**: to fill those fields it still has to
fetch the data — a REST call here, an RPC call there, a database read — but those calls happen
**inside your datacenter / VPC**, where hops are fast and reliable (sub-millisecond),
*not* over the public internet.

That's the core win:

> The expensive, unreliable network leg (client → server) is crossed **once**, carrying
> **only the requested fields**. The fan-out to many backends still happens, but on the fast
> internal network. Fewer round-trips + less data on the wire = quicker page loads and lower
> latency, especially on flaky mobile connections.

### Who uses it, and when it fits

- **Where it shines:** client-facing apps that assemble a screen from **many backends** and run
  on **varied clients** (phone, TV, web) with different data needs — Facebook, Netflix, GitHub,
  Shopify. A flexible, precise aggregation layer is exactly the job.
- **Where it's overkill:** a simple CRUD service with one consumer and one data source — plain
  REST is simpler. GraphQL earns its keep when *aggregation* and *client flexibility* matter.

## Fundamentals

### Core operations

A GraphQL schema has up to three **root** entry points — ordinary object types GraphQL treats
specially:

**1. Queries (read)** — fetch data; the equivalent of REST `GET`. Read-only: they retrieve data
and don't modify server state.

```graphql
query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
  }
}
```

**2. Mutations (write)** — create / update / delete; the equivalent of REST `POST`/`PUT`/`PATCH`/
`DELETE`. They change server-side state. Unlike query fields (which execute in **parallel**),
mutation fields execute **sequentially** to avoid race conditions.

```graphql
mutation UpdateUserName($id: ID!, $newName: String!) {
  updateUser(id: $id, name: $newName) {
    id
    name
  }
}
```

**3. Subscriptions (real-time)** — the server pushes updates to connected clients when an event
occurs. Instead of the request-response cycle, a subscription holds a **long-lived, persistent
connection** (usually WebSockets): the client "listens," and the server pushes the payload when
the event triggers.

```graphql
subscription OnUserCreated {
  userCreated {
    id
    name
  }
}
```

### The type system

First, what a schema file actually looks like — the **contract**, written in SDL (Schema
Definition Language): the `Show` and `Person` types, an enum, and a `Query` root with the
`shows`/`show` entry points:

```graphql {filename="schema.graphql"}
"A movie or series in the catalog."
type Show {
  id: ID!               # ID! — required, opaque unique key
  title: String!        # String! — required text
  releaseYear: Int!
  kind: ShowKind!       # an enum (below)
  cast: [Person!]!      # a list of Person, never null, no null items
}

type Person {
  id: ID!
  name: String!
}

"A one-off movie or an episodic series."
enum ShowKind {
  MOVIE
  SERIES
}

# The Query root: the read entry points a client can ask for.
type Query {
  shows: [Show!]!        # all shows
  show(id: ID!): Show    # one show by id (nullable — the lookup may miss)
}
```

A client picks fields off that schema, and the **response mirrors the query's shape** —
containing *only* the fields asked for:

```graphql {filename="query"}
query {
  shows {
    cast { name }
    title
  }
}
```

```json {filename="response"}
{
  "data": {
    "shows": [
      {
        "cast": [{ "name": "Millie Bobby Brown" }, { "name": "David Harbour" }],
        "title": "Stranger Things"
      },
      {
        "cast": [{ "name": "Robert De Niro" }, { "name": "Al Pacino" }],
        "title": "The Irishman"
      }
      // …one entry per show
    ]
  }
}
```

Here's that example in a playground (Apollo Sandbox):

![Apollo Sandbox playground at localhost:4001: left pane shows the schema Documentation explorer for the shows query and Show type fields (title, releaseYear, cast: [Person!]!); middle pane shows the query { shows { cast { name } title } }; right pane shows the JSON response listing each show's cast and title, with 200/105ms/400B stats](apollo_graphql_playground.png)

Now the pieces of that schema, one kind at a time.

**Mental model** (the frame worth remembering): **scalars & enums** are *leaves* (actual
values — `String`, `Int`, `ID`, `Boolean`, `Float`, or an enum like `ShowKind`); **objects**
are *branches* you select sub-fields on (`Show`, `Person`); **input types** are the data going
*in* as arguments (you can't pass a regular `type` as an argument — request DTOs use `input`);
and **`!`/`[]`** are modifiers layered on any of them. *(Interfaces and unions exist too, for
polymorphic fields — reach for them when a field can return one of several types.)*

To learn more, refer to the official [GraphQL docs](https://graphql.org/learn/introduction/).

The part actually worth internalizing (the rest is lookup-able): **nullability is a
contract** — `!` (non-null) and `[]` (list), which are modifiers separate from *what kind* a
type is. The list + non-null combinations each mean something different:

```graphql
[Show]     # list may be null; items may be null
[Show!]    # list may be null; no null items inside
[Show!]!   # list never null (at least []), no null items   ← our `shows`
[Show]!    # list never null; but items may be null
```

## Resolvers

A **resolver** is the function behind a field — it produces that field's data. There's one
(conceptually) per field, and when a resolver returns an object, the resolvers for *its* fields
run next — so resolving a query walks the tree from the root down.

Every resolver has access to the same things, whatever the language or framework:

- **the parent** — the object this field belongs to (what the resolver one level up returned).
- **the arguments** — what the client passed for this field (e.g. an `id`).
- **a per-request context** — shared state for the request (auth/user, DB handles, loaders).

There are two kinds: a **top-level entry point** (a `Query`/`Mutation` field) and a
**field/computed resolver** (a field on a type). The example below is JavaScript, but the
*shape* is universal — other stacks express the same thing differently (e.g. Netflix's **DGS**
uses Java annotations like `@DgsQuery` / `@DgsData`, graphql-java uses `DataFetcher`s):

```js {filename="resolvers.js (JavaScript / Apollo)"}
const resolvers = {
  // 1. Top-level entry point: fetch the show matching the client's argument id
  Query: {
    show: (parent, args, context) => context.db.getShowById(args.id),
  },

  Show: {
    // 2. Field resolver: `parent` is the show the query returned; fetch its cast
    cast: (parent, args, context) => context.db.getCastForShow(parent.id),

    // 3. Computed resolver: no fetch — just derives a value from `parent`
    isReleased: (parent) => parent.releaseYear <= new Date().getFullYear(),
  },
};
```

Two ideas to hold onto:

- **Resolvers are thin.** A resolver *delegates* to a data source and returns plain data — it
  doesn't hold business logic. And that source can be **anything**: a DB query, a REST call, a
  gRPC call. GraphQL doesn't care (see ["where GraphQL fits"](#where-graphql-fits-in-a-microservices-architecture)).
- **You only write the interesting ones.** Fields with no explicit resolver use a **default
  resolver** — just read the property of the same name off the parent. So `Show.title` needs no
  code; you only write resolvers for entry points and fetched/computed fields like `cast`.

## The N+1 problem

A **single** client query hitting a **single** service can explode into many downstream
calls (gRPC / HTTP / SQL). Two multipliers stack:

**1. Breadth — fields fan out to different backends.** One `Show` may need several services;
each field's resolver makes its own call. Take this query:

```graphql {filename="query"}
query {
  show(id: "1") {
    title          # from the catalog DB
    posterImage    # a URL, from an images REST service
    availability   # from a licensing gRPC service
    bingeScore     # from an ML ranking service
  }
}
```

Each field is resolved independently, and the source can differ per field — a DB read here, a
gRPC call there, a REST call for another:

```js {filename="resolvers.js"}
const resolvers = {
  Show: {
    // title needs no resolver — it's already on the show object (default resolver).
    posterImage:  (show, _args, ctx) => ctx.imagesApi.getPosterUrl(show.id),        // REST → URL
    availability: (show, _args, ctx) => ctx.licensingClient.getAvailability(show.id), // gRPC
    bingeScore:   (show, _args, ctx) => ctx.rankingClient.scoreFor(show.id),        // gRPC/ML
  },
};
```

This fan-out is expected — it's the aggregation GraphQL exists to do (the client would've made
these calls itself over REST anyway). The win: the client makes **one** request; the several
backend calls happen server-side, in the datacenter.

> **Note — GraphQL returns a URL, not the image.** `posterImage` resolves to a *string URL*; the
> client then fetches the actual bytes from a **CDN**, out of band. GraphQL carries structured
> data and *pointers* to blobs — the blobs (images, video) travel over HTTP/CDN, never through
> the graph. (Same reason video streaming bypasses the graph — see [the iceberg](#where-graphql-fits-in-a-microservices-architecture).)

**2. Depth × cardinality — the N+1 problem (the dangerous one).** A **list** field where a
per-item resolver runs once per element:

```graphql {filename="query"}
query {
  shows(first: 20) {     # 1 call  → getShows(limit: 20)
    title
    cast { name }        # runs ONCE PER SHOW → 20 calls → getCastForShow(showId)
  }
}
# → 1 + 20 = 21 calls for what should be 2
```

{{< callout type="info" >}}
N+1 comes from **normalization** — related data sits behind an id, so fetching it for a
list means one lookup per item. GraphQL doesn't cause this; it makes deeply-nested data
easy to *request*, surfacing the N+1 that was always there.
{{< /callout >}}

### Why it happens

Concretely: a `Show` stores `castIds: [42, 87]` — just pointers — while the real person records
live elsewhere (a People service, or a separate `cast` table), because cast is shared across
thousands of titles. So resolving `cast` means a lookup **per show**.

- **Across services or in one DB — same shape.** With a naive ORM it's `SELECT … FROM shows
  LIMIT 20` (1 query), then a lazy `show.cast` firing `SELECT … WHERE show_id = ?` **per row**
  (20 more).
- **Embedding avoids it, but has a cost.** A `Show` would already contain its cast only if
  **denormalized** — which trades N+1 for data duplication, and you hit N+1 again the moment you
  ask for a field the embedded copy lacks (`cast { awards }`).



### The fix: DataLoader

> DataLoader is a generic utility to be used as part of your application's data fetching layer
> to provide a consistent API over various backends and reduce requests to those backends via
> batching and caching. — [DataLoader](https://github.com/graphql/dataloader)

Instead of each resolver fetching on its own, it hands its id to a loader with `load(id)`. The
loader **collects all the ids requested at nearly the same moment**, makes **one batched call**
with the whole list, then gives each caller back its result.

![Inside the Catalog subgraph resolving a shows-with-cast query, side by side: without DataLoader the cast field resolver makes 5 separate findCastForShow calls (6 total, N+1); with DataLoader the 5 .load(id) calls are gathered in one tick into a single batched findCastForShows call (2 total)](catalog-dataloader-zoom.svg)

*Left: the N+1 — one `findCastForShow` per show. Right: the same resolver calls `loader.load(id)`, and DataLoader collapses them into one batched fetch (6 calls → 2).*

```text
cast resolver, show 1  → load("1")  ┐
cast resolver, show 2  → load("2")  │  collected together,
        ...                         ├─►  getCastForShows(["1".."20"])   ← ONE call
cast resolver, show 20 → load("20") ┘

21 calls → 2   (1 for the list of shows + 1 batched call for all their cast)
```

Two parts make it work, and you need both:

1. **The loader collects the ids** for you — the resolvers stay simple (`load(id)`), and the
   loader batches them behind the scenes. (In a single-threaded runtime like Node it gathers the
   ids within one event-loop tick; the mechanism differs per platform, but the idea is the same.)
2. **You provide a batch function** that does a *genuine* multi-key fetch — `WHERE id IN (...)`, a
   Redis `MGET`, a `BatchGet` RPC. If it secretly loops single fetches, you've batched the ids but
   not the calls — no win.

It also **caches within the request**, so a person appearing in two shows is fetched once. That
cache is why a loader is **created fresh per request** — it should reset each request and never
leak data between users.

{{< callout type="info" >}}
"Isn't this just a bulk API?" The bulk fetch is the easy half — *you* write it. DataLoader is the
**coordination layer**: it turns N separate resolver calls, each holding one id and unaware of the
others, into one bulk call — without you wiring the ids together by hand.
{{< /callout >}}

**If the source has no bulk endpoint,** the N→1 collapse isn't possible — the loader can't batch
calls a backend won't accept together. Fall back to: get a batch endpoint added (best), lean on the
dedup cache, cap concurrency to survive the fan-out, or cache responses across requests.

### Another fix: joins

DataLoader isn't the only answer. If the related data lives in the **same database**, you can
**JOIN** instead of making a second fetch at all:

```sql
SELECT shows.*, cast.* FROM shows JOIN cast ON cast.show_id = shows.id;  -- one query, no N+1
```

One round-trip, no per-item calls. But joins have their own traps:

- **Only works when co-located.** If cast lives in a *separate service*, there's no table to
  join against — you're back to DataLoader over the network.
- **Over-fetching by default.** A resolver that always joins pulls cast **even when the client
  didn't ask for it** — wasted work on every query. The fix: inspect what the client actually
  requested and **join only when `cast` is in the query** ("look-ahead"). Powerful, but couples
  the resolver to the query shape.

> **Rule of thumb:** **join** when data is co-located; **DataLoader** when it's spread across
> sources/services (the common case, and the only option once federated). Many resolvers use
> both. In JS, query builders / ORMs like [Prisma](https://www.prisma.io/),
> [Knex](https://knexjs.org/), and [Drizzle](https://orm.drizzle.team/) build these joins.

### Catching it early

The trap: **N+1 is invisible at small data sizes.** With 3 shows it's a handful of fast calls
and feels fine; with 200 it's 201 calls and your p99 latency falls over. So you want to catch it
early:

- **While writing code** — the tell is a **single-item fetch inside a list field** (a
  `getCastForShow(id)` called per show). Any field fetched from a *separate source* is a
  candidate. Many teams just **require a DataLoader for every cross-source field** as a rule, so
  it never ships.
- **At runtime** — the clearest signals: **tracing** (one request shows the same `cast` call
  repeated 20×), **DB query logs** (the same query 20× with different ids), or **latency that
  grows with list size**.

### Defending the fan-out

Recall the [core tradeoff](#what-is-graphql-and-why-does-it-exist): GraphQL relocates the
fan-out from the client's network to the server's. That's usually a win — but the complexity
doesn't vanish, so at scale these defenses aren't optional:

- **DataLoader** — batch N+1 into one call (above).
- **Depth / complexity limits** — reject an exploding query *before* running it.
- **Pagination** — never unbounded lists.
- **Per-backend timeouts** — one slow downstream can't hang the whole query.

## Federation

So far we've pictured **one** GraphQL server. That's fine for a small team — but a large consumer
app like Netflix has **dozens of teams** contributing to its graph. As one giant GraphQL server,
every team would edit the same schema and resolvers, constantly stepping on each other.

**Federation** splits the graph so each team owns and deploys their own slice, while the client
still sends **one** query to **one** endpoint. That query travels over HTTP through the edge and
an API gateway to a **router**, which owns the combined ("federated") schema, figures out which
services own which fields, fans the query out, and stitches the results into one response:

![High-level architecture: phone/TV/web clients send one GraphQL query through CDN and API gateway to a federated GraphQL router, which fans out planned sub-queries to Catalog, Reviews, and Users subgraphs, each owning its own data source; caching happens at every hop](architecture-overview.svg)

> Each field is resolved by the **team that owns it**. GraphQL stays a **composition /
> presentation layer** — the real data lives in the services behind it (gRPC/REST + databases).

Three pieces make that up:

**Subgraph** — one team's slice of the graph: a standalone GraphQL service that owns a **domain**
(Catalog owns `Show`, Reviews owns ratings, Users owns profiles), with its own schema, resolvers,
data, and deploy. A subgraph is a *domain boundary*, not necessarily one microservice — a domain
may sit atop several backing services, but it publishes **one** subgraph to the graph.

**Supergraph** — the single schema formed by **composing all the subgraphs** together
(supergraph = composition of subgraphs). It's the unified API the client sees; no client ever
talks to a subgraph directly. Composition is driven by a config that lists the subgraphs and where
they live:

```yaml {filename="supergraph.yaml"}
subgraphs:
  catalog:
    routing_url: http://catalog:4001/graphql
    schema: { file: ./catalog.graphql }
  reviews:
    routing_url: http://reviews:4002/graphql
    schema: { file: ./reviews.graphql }
```

**Router** — the entity that sits in front, holds the composed supergraph, and does three things
per request:

1. **Query planning** — work out which subgraph(s) own the requested fields.
2. **Execution** — call them in the right order (some calls depend on another's result).
3. **Stitching** — assemble the sub-responses into one clean result.

The client never sees any of this — one query to one endpoint, one response. The router's own
runtime behavior (headers, auth, telemetry, limits) is configured separately, e.g. a
`router.yaml`.

The one hard part: letting one team's type *refer to* another's. Reviews wants to attach a
`reviews` field to a `Show` — but **Catalog** owns `Show`. Federation solves this with two ideas:

> **Federation = identity + ownership.** Each type has an **identity** (a `@key` — a field like
> `id` that uniquely identifies it) and an **owner** (the subgraph that defines it). Any other
> subgraph can then *reference* that type by its key and contribute fields to it.

A type with a `@key` is an **entity** — e.g. `Show @key(fields: "id")`. Entities are the shared
domain objects (`Show`, `User`) that multiple subgraphs attach fields to; the `@key` is the
handle that makes those cross-subgraph references possible. (The current standard is **Apollo
Federation 2**; Netflix builds this with its **DGS** framework.)

### Not everything becomes a subgraph

A natural question: *does every service become a subgraph, and does all service-to-service
traffic now route through the router?* **No on both counts.** The dividing line for "should this
be a subgraph?" isn't client-facing vs internal — it's *does this own data/fields that belong in
the client-facing graph?* So the graph is a **shallow aggregation layer**: a handful of domains
(Catalog, Reviews, Users, maybe Search) publish subgraphs; most services sit behind or beside
them.

**The router is a front door, not a service bus.** It only splits a client query across the
subgraphs that own the requested fields and stitches the results. Backend services still talk to
each other **directly** — gRPC, REST, events — for everything that isn't "a client asked for
these fields":

```text
CLIENT-DRIVEN (through the router):        SERVICE-TO-SERVICE (direct, no router):
  client → router → Catalog subgraph         Playback ──gRPC──► Licensing
                 └→ Reviews subgraph          Recommendations ──gRPC──► Catalog
                                              Billing ──event──► Notifications
```

Routing internal calls through the router would add a latency + failure hop and couple every
interaction to the router. So **gRPC service-to-service traffic doesn't go away** — it stays
peer-to-peer ([mesh territory](../grpc/)). A subgraph speaks GraphQL *upward* to the router, and
often gRPC *sideways* to peer services and its own data.

**The iceberg: what stays internal.** The graph is a thin slice near the top; most services sit
below it and never see a client query. For a Netflix-shaped app:

- **Behind a subgraph** (a resolver calls these): licensing / DRM, encoding/transcoding,
  personalization & ranking (ML), artwork.
- **Never near the graph** (own data planes): the CDN serving video bytes, playback/adaptive-
  bitrate control, the telemetry pipeline (billions of events), the ML training platform, billing,
  experimentation, fraud.

Some client paths **bypass the graph entirely** — video bytes come from the CDN (GraphQL only
returns the manifest/URLs), and playback telemetry is fire-and-forget events. The graph is for
**structured, read-heavy, aggregation-shaped** client data. Federation unifies the *few*
client-facing domains without forcing the deep iceberg of internal services into one schema.

### Resolving across subgraphs

So how does Reviews attach `reviews` to a `Show` it doesn't own? When the router needs an
entity's fields from another subgraph, it hands that subgraph a **reference** — just the type
name and key, `{ __typename: "Show", id }`. The subgraph resolves that reference into an object
and its [field resolvers](#resolvers) fill in the fields it owns (`reviews`). Reviews never needs
the full `Show` — just the `id` — which is exactly why the `@key` matters.

### Federation vs schema stitching

Before federation, the way to combine schemas was **schema stitching**: a gateway imported
each service's schema and you wrote **glue code at the gateway** to link types across services.
The problem: that glue lived in the *gateway*, so the gateway had to know about every service's
internals — a central bottleneck that every team had to coordinate through.

> **Federation flips ownership.** Each subgraph *declares* how its types extend others
> (`@key`, `@external`) **in its own schema**; the gateway/router just **composes** those
> declarations — no hand-written stitching glue. Teams evolve their slice independently; the
> router doesn't need bespoke per-service knowledge. That's why federation superseded stitching
> for large multi-team graphs.

Composing the subgraphs into the supergraph happens at **build time** (via a schema registry +
composition checks in CI): if one team's change would break the combined schema — a broken
cross-subgraph reference, an incompatible type — it's caught **before deploy**, not at runtime.
That build-time safety net is a big part of why federation scales to many teams.

## Production concerns

The topics that separate "I built a GraphQL server" from "I run one at scale."

### Scalability

The router is where scale concentrates — and it's designed for it:

- **Built for throughput.** The modern **Apollo Router is written in Rust** (replacing the older
  Node gateway) for high performance and low overhead on the hot path — it does query planning +
  fan-out for every request.
- **Stateless → horizontal scale.** The router holds no per-user state, so you run **many
  identical instances** behind a load balancer and add more for more traffic. On **Kubernetes**
  that's just more replicas (a `Deployment` + `HorizontalPodAutoscaler`). Handling billions of
  requests is just many router replicas fronting the subgraphs.
- **Subgraphs scale independently.** Each subgraph is its own deployable with its own scaling
  profile; teams ship their slice without a monolith deploy, and the router composes the current
  set (service discovery points it at healthy instances).

### Observability & telemetry

Because one client query fans out into many resolver/subgraph calls, you need to see *inside* a
request. Distributed **tracing** (OpenTelemetry, Apollo traces) renders each request as a
waterfall of spans — the fastest way to spot an N+1 (a resolver span repeated 20×), a slow
subgraph, or a downstream timeout. Pair it with per-resolver **metrics** (latency, error rate,
call counts) and structured logs.

### Governance (field-level access)

_(draft)_

Once many consumers (client apps, internal tools) query one graph — especially with Personally
Identifiable Information (PII), compliance, and security in play — the question becomes: **who is
allowed to read which field?** And, critically, when a team adds a new (possibly sensitive) field,
it must **not** become blindly readable by everyone. (Most acute in a federated graph, where the
supergraph exposes every `Type.field` from every subgraph — but the pattern applies to any shared
API.)

> **Core idea:** access is granted per **(type, field) × consumer**, **default-deny**, and each
> grant is an **owner-approved request** that doubles as the audit record.

- **Per-field, not per-service** — a consumer is granted specific fields (`Person.name`), not "the
  People subgraph." **Per-consumer** — each app has its own allowlist.
- **Default-deny.** A field is unreadable until granted — *even though it's visible in the schema*.
  Visibility ≠ authorization.
- **Owner-approved & recorded.** The request routes to the field's owning team; each grant is
  tracked (requester, fields, approver, timestamp) — the workflow *is* the audit trail.

**Why per-field + default-deny is the crux:** because grants name *specific* fields, a new field
starts with an **empty allowlist** — so adding one can never *silently* widen who reads data. If
access were per-service, a new sensitive field would leak to every historical consumer by default.

Two distinctions worth keeping straight:

- **Grant vs usage.** The grant record answers *"can this app ever read this field?"* — not *"did
  it, when, how often?"* (that's the telemetry above). Full auditability needs both.
- **App-field vs per-subject auth.** "Can this app read this field type?" is separate from "may
  this session see **this customer's** row right now?" The latter is a contextual gate; the most
  sensitive fields may add encryption-scoped access on top.

The cost is real: every new field a consumer needs is an approval before shipping, which creates
friction and risks rubber-stamping if owners are overloaded — good tooling and clear sensitivity
tiers are what keep it bearable.

### Other essentials

- **Caching (multi-layer)** — client normalized cache · CDN/edge · Automatic Persisted Queries (APQ) · router response cache · per-request DataLoader.
- **Security** — query **depth / complexity limits**, persisted-query safelisting, disabling introspection in prod, rate limiting.
- **Schema evolution** — additive-only changes; `@deprecated` fields instead of versioned URLs; composition checks block breaking changes.
- **Reliability** — partial errors (`data` + `errors`), per-subgraph timeouts/retries.

## GraphQL vs REST vs gRPC

_(comparison table — to be written)_ Short version: **gRPC** for internal service-to-service
(binary, typed, fast); **REST** for simple public resources; **GraphQL** for a
**client-facing aggregation layer** over many backends where clients need flexible,
precise fetching. They compose — a GraphQL resolver often calls a gRPC service.

## Talks & deeper resources

_(cited by title/speaker/venue; verify the exact URL before relying on it)_

- Official docs — [graphql.org/learn](https://graphql.org/learn/) (authoritative intro + full type reference) · [Apollo Federation docs](https://www.apollographql.com/docs/federation/)
- **Netflix** — *How Netflix Scales its API with GraphQL Federation* — Netflix Technology Blog. _(verify)_
- YouTube — *Design Principles of Federated GraphQL* — Martijn Walraven (Apollo), [GraphQLConf 2024](https://www.youtube.com/watch?v=asv-XakmUuA).
- YouTube — *GraphQL Federation: The Architecture That Powers Netflix's 70+ Microservices* — [ByteMonk](https://www.youtube.com/watch?v=TG6fvxEpDvQ).
- **DataLoader** — [github.com/graphql/dataloader](https://github.com/graphql/dataloader) — the batching pattern, from Facebook.

{{< details title="Planned topics" closed="true" >}}

- **Pagination** — offset vs cursor; the Relay **connections** spec (`edges`/`node`/`pageInfo`).
- **Errors** — partial success (`data` + `errors`), error masking, and why HTTP is usually `200`.
- **Realtime** — **subscriptions** (WebSocket / SSE); see the [realtime family](../) in networking for transport tradeoffs.
- **GraphQL vs REST vs gRPC** — full comparison table.

{{< /details >}}

## Quick self-check (recall from memory)

1. What two REST problems does GraphQL target, and how does a single query address them?
2. Client sends one query for a show's title **and** its reviews — how does the router get both when two different teams own them?
3. What exactly is the N+1 problem in a resolver, and how does DataLoader fix it?
4. Why is a GraphQL resolver "thin"? What lives behind it in production?
5. Federation vs schema stitching — what did federation change about *where* the glue lives?
6. Why can the router scale horizontally, and what makes that possible?
