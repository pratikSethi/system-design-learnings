---
title: GraphQL
---

A query language for APIs where the **client** specifies exactly what data it wants, and a
single request can pull from many backends. This note starts from the basics and builds up to
**federation** — the way large orgs (Netflix, etc.) run one graph across many
independently-owned services.

{{< callout type="info" >}}
This note grows alongside a hands-on project in the repo:
`projects/netflix-clone/` — a federated Netflix-style graph built one subgraph at a time
(Catalog first, then Reviews, then a Router). Diagrams below map 1:1 to what we build.
{{< /callout >}}

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

### What the tooling looks like

You develop against a **playground** — here, **Apollo Sandbox**: schema explorer on the left,
your query in the middle, the live JSON response on the right (note the `200 · 105ms · 400B`
stats). This is the project's catalog subgraph answering `shows { cast { name } title }`:

![Apollo Sandbox playground at localhost:4001: left pane shows the schema Documentation explorer for the shows query and Show type fields (title, releaseYear, cast: [Person!]!); middle pane shows the query { shows { cast { name } title } }; right pane shows the JSON response listing each show's cast and title, with 200/105ms/400B stats](apollo_graphql_playground.png)

*Browse the schema, write a query with autocomplete, run it, and get back exactly the fields
you asked for.*

## The basics: operations & the type system

### The three operation types

A GraphQL schema has up to three **root** entry points — ordinary object types GraphQL treats
specially:

- **`Query`** — reads (the `shows`/`show` fields in our project).
- **`Mutation`** — writes (create/update/delete).
- **`Subscription`** — a stream of events pushed over time (realtime; WebSocket / SSE).

### The type system

_(draft — grows as the project adds a Mutation, input filters, an interface)_

**Mental model:** **scalars & enums** are *leaves* (actual values); **objects, interfaces,
unions** are *branches* (you select sub-fields on them); **input types** are data going *in*
(arguments); **`!` and `[]`** are modifiers layered on any of them.

**Scalars** — the leaf values, can't be drilled into. Five built-in:

| Scalar | Holds | In `shows.graphql` |
|---|---|---|
| `Int` | 32-bit signed integer | `releaseYear: Int!` |
| `Float` | double-precision float | — |
| `String` | UTF-8 text | `title: String!` |
| `Boolean` | `true` / `false` | — |
| `ID` | opaque unique key — serialized as a String, but "don't do math on it" | `id: ID!` |

You can define **custom scalars** too (`scalar DateTime`, `scalar URL`) with serialize/parse
logic in code — common for dates/emails.

**Object type** — a named set of fields; the workhorse (`type Show { … }`).

**Enum** — a closed set of named values (`enum ShowKind { MOVIE SERIES }`); anything else is
a validation error.

**Interface** — shared fields several objects implement; a field can return the interface and
clients pick concrete fields via `... on Show { … }`.

```graphql
interface Media { id: ID!  title: String! }
type Show implements Media { id: ID!  title: String!  kind: ShowKind! }
```

**Union** — "one of these types, sharing **no** common fields" — e.g. `union SearchResult = Show | Person | Collection`. Clients select per-type with inline fragments.

**Input type** — a special object used **only for arguments** (you can't pass a regular
`type` as an argument). Pure data-in:

```graphql
input ShowFilter { kind: ShowKind  releasedAfter: Int }
type Query { shows(filter: ShowFilter): [Show!]! }
```

**Modifiers — `!` (non-null) and `[]` (list).** Separate from *what kind* a type is. The
list + non-null combinations mean different things, and this is the part worth pinning down:

```graphql
[Show]     # list may be null; items may be null
[Show!]    # list may be null; no null items inside
[Show!]!   # list never null (at least []), no null items   ← our `shows`
[Show]!    # list never null; but items may be null
```

So `shows: [Show!]!` is a real contract: *always* a list, every element a real `Show`.
`show(id: ID!): Show` is deliberately the opposite — a lookup **may miss**, so the return is
nullable (`Show`, not `Show!`).

## Resolvers

A **resolver** is the function behind a field — it produces that field's data. A resolver map
mirrors the schema's shape: for each type, field-name → function. Key idea: a resolver is
**thin** — it *delegates* to a data source and returns plain data; it doesn't hold business
logic or talk to a DB directly. Fields with no explicit resolver use a **default resolver**
(read the property of the same name off the parent object).

### Two models: data (entity) vs API (DTO) — the Spring analogy

_(draft — from the project; clicks if you've done layered services)_

A common confusion: there are **two** `Show` types in a typed GraphQL server, and that's on
purpose. It's the same entity-vs-DTO split as a Spring/JPA service:

| Spring / JPA | GraphQL (this project) | Role |
|---|---|---|
| `@Entity` / DAO | `data/shows.ts` → `Show` | persistence/domain model — what the backend **stores** |
| response **DTO** | generated `Show` (from SDL) | API contract — what clients **see** |
| MapStruct / manual mapper | codegen **`mappers`** + **field resolvers** | translation between the two |

The clean framing:

> **entity (`data/shows.ts`) → DTO (generated from SDL), bridged by resolvers.** Fields that
> match by name **auto-map for free** (the default resolver just reads the property); fields
> that differ get a **field resolver** — *that function is your hand-written mapping* for that
> one field. GraphQL's **`input` types** are the request-DTO side.

Request vs response, in GraphQL terms:

- **Response DTO** (data going *out*) → generated **object types** like `Show`. The entity's counterpart.
- **Request DTO** (data coming *in*) → **`input` types**. Add a mutation `rateShow(input: RateShowInput!)`
  and codegen generates a `RateShowInput` TS type — that's your request model.

So GraphQL *enforces* the request/response DTO split (`type` out, `input` in — you can't swap
them), and codegen emits a TS type for each side. Keep the two `Show`s separate for the same
reason you didn't return JPA entities straight from a controller: the moment the shapes diverge
(DB has `castIds`; API exposes `cast: [Person!]`), the seam is already there.

## One client query → many downstream calls

A **single** client query hitting a **single** service can explode into many downstream
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

DataLoader is a **request-scoped middleman** between resolvers and the data source. Resolvers
stop fetching directly and instead call `loader.load(id)` — which returns a Promise *without
fetching yet*. DataLoader collects every id requested in the **same event-loop tick**, then
calls your **batch function once** with the whole array, and hands each caller its result.

```text
cast resolver, show 1 → load("1") ┐
cast resolver, show 2 → load("2") │  (each gets a pending Promise; nothing fetched yet)
cast resolver, show 3 → load("3") ├─► batchFn(["1".."20"]) ONCE ─► getCastForShows([...])
        ...                       │      returns [c1..c20], DataLoader settles each Promise
cast resolver, show 20 → load("20")┘                              21 calls → 2
```

Two halves make it work, and **both** are required:

1. **The gather-across-a-tick trick (DataLoader's job).** All N `cast` resolvers run in the same
   JS tick; DataLoader collects their ids during the tick and flushes one batch at the end. It's
   automatic — it exploits the event loop (see the [concurrency note](../../concurrency/event-loop-vs-threads/)).
2. **A real bulk fetch (your job).** The batch function must do a genuine multi-key fetch
   (`WHERE id IN (...)`, `MGET`, a `BatchGet` RPC). If it just loops single fetches internally,
   you've batched the *ids* but not the *calls* — no win.

> "Isn't DataLoader just a bulk API?" The **bulk fetch** is the easy half (you write it).
> DataLoader is the **coordination layer**: it turns N independently-executing resolver calls —
> each holding one id, each unaware of the others — into one bulk call, without you threading the
> ids together by hand. Plus a **per-request cache** that dedupes repeats (a person in two shows
> is fetched once) and must be **built fresh per request** (in `context`) so it resets and never
> leaks between users.

**When there's no bulk endpoint:** DataLoader batches *keys in your process*; it can't batch
network calls a remote API won't accept together. If the source only offers single-id fetches,
the N→1 collapse isn't possible — fall back to: get a batch endpoint added (best), lean on
DataLoader's **dedup cache**, **cap concurrency** (e.g. `p-limit`) to survive the fan-out, or
**cache responses** across requests. "Does this source support multi-key fetch?" is a question
you ask when designing a resolver.

So the fix is **batching**, not "embed everything." This is why these topics
cluster: **resolvers → N+1 → DataLoader → complexity limits** are all facets of "one query,
many downstream calls."

![Inside the Catalog subgraph resolving a shows-with-cast query, side by side: without DataLoader the cast field resolver makes 5 separate findCastForShow calls (6 total, N+1); with DataLoader the 5 .load(id) calls are gathered in one tick into a single batched findCastForShows call (2 total)](catalog-dataloader-zoom.svg)

*Zoom into the catalog subgraph. Left: the N+1 — one `findCastForShow` per show. Right: the same resolver calls `loader.load(id)`, and DataLoader collapses them into one batched fetch. This is the exact behavior the project's terminal logs show (6 calls → 2).*

### How you detect it (predict, prevent, confirm)

A fair question: as a developer, do you know N+1 is coming *ahead of time*, or only after a
performance incident? Both — and mature teams shift it left.

**The structural tell** — the earliest signal, visible while writing code: a **single-item
fetch invoked inside a list field**. A data function shaped `findCastForShow(showId)`
(singular, one id) called under `shows: [Show!]!` *must* run once per show. A batch-shaped
`findCastForShows(showIds: [])` (plural, array) can't — the plural/singular shape of your
fetch function is the tell.

- **Predict (schema-design time).** Any field returning an object/list that's fetched from a
  *separate source* is an N+1 candidate — `Show.cast` where `Person` lives in another
  table/service. You can circle the risky edges by reading the schema.
- **Prevent (review / lint / convention).** ESLint rules (`graphql-no-n-plus-one`-style,
  graphql-eslint) flag a field resolver doing I/O without a loader; many shops just **mandate
  DataLoader for any cross-source field** as policy, so N+1 is prevented rather than detected.
- **Confirm (runtime — the real answer).** You *confirm and discover* it by observing execution:
  - **Tracing / APM** (OpenTelemetry, Apollo traces, Datadog) — one request as a waterfall;
    the `cast` span repeated 20× is unmistakable. The single most reliable signal.
  - **DB / query logs** — `SELECT … WHERE show_id = ?` logged 20× with different ids; slow-query
    logs and `pg_stat_statements` surface "same query shape, huge call count."
  - **Metrics** — latency that **scales with result-set size** (p99 climbs as a list grows) is a
    classic N+1 fingerprint.

> **The trap:** N+1 is *invisible at small data sizes*. With 3 shows it's 4 fast calls and feels
> fine; with a 200-item list it's 201 calls and p99 falls over. That's why latency-scales-with-
> list-size is the fingerprint, why load tests catch what dev misses, and why simulating
> per-call latency (as this project does) makes the cost visible *before* production.

### Another fix: joins (when the data is co-located)

DataLoader isn't the only answer. If the related data lives in the **same database**, you can
**JOIN** instead of making a second fetch at all:

```sql
SELECT shows.*, cast.* FROM shows JOIN cast ON cast.show_id = shows.id;  -- one query, no N+1
```

One round-trip, no per-item calls. But joins have their own traps:

- **Only works when co-located.** If cast lives in a *separate service* (the federated case),
  there's no table to join against — you're back to DataLoader over the network.
- **Over-fetching by default.** A naive resolver that always joins pulls cast **even when the
  client didn't ask for `cast`** — wasted work on every query.
- **The fix for that: look at what was requested.** The 4th resolver arg, `info`, describes the
  query's requested fields. A resolver can inspect it and **conditionally join** only when `cast`
  is in the selection set (libraries like `graphql-fields` / dataloader-less "look-ahead"
  patterns do this). Powerful, but couples the resolver to query shape and is fiddly to maintain.

> **Rule of thumb:** **join** when the data is co-located and you can scope it to the request
> (`info`-driven); **DataLoader** when data is normalized across sources/services (the common
> case, and the only option once federated). Many production resolvers use **both** — a join for
> same-DB relations, a loader for cross-service ones.

In the JS world, query builders / ORMs like [Knex](https://knexjs.org/),
[Prisma](https://www.prisma.io/), and [Drizzle](https://orm.drizzle.team/) are what you'd
reach for to build these joins (and some integrate DataLoader-style batching) — worth a look
if the data layer interests you.

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

## The distributed graph: where GraphQL sits in a system

Zoom out from one service. In production, a client (phone, TV, web) sends **one** GraphQL query.
It rides HTTP through the edge and an API gateway to a **router**, which owns the combined
("federated") schema. The router figures out which backend services own which fields, fans
the query out to them, and stitches the results back into one response.

![High-level architecture: phone/TV/web clients send one GraphQL query through CDN and API gateway to a federated GraphQL router, which fans out planned sub-queries to Catalog, Reviews, and Users subgraphs, each owning its own data source; caching happens at every hop](architecture-overview.svg)

*The whole system at a glance. The project builds it right-to-left: first a single Catalog subgraph, then Reviews extending it, then the Router in front.*

The one idea to hold onto:

> The client sees **one** schema and sends **one** request. Each field is resolved by the
> team that owns it. GraphQL is a **composition / presentation layer** — the real data
> lives in services behind it (gRPC/REST + databases).

### Where GraphQL fits in a microservices architecture

The natural question once you see the diagram: *does every service become a GraphQL
subgraph, and does all service-to-service traffic now route through the router?* **No on
both counts** — and getting this right is most of the intuition.

**A subgraph is a *domain boundary*, not a microservice.** The dividing line for "should this
be a subgraph?" is **not** client-facing vs internal. It's:

> **Does this service own data/fields that belong in the client-facing graph?**

And crucially:

> A subgraph is a **domain boundary, not necessarily one microservice**. A domain (say
> Catalog) may be backed by **several** internal microservices, with **one** subgraph in
> front exposing the slice of them that clients need. So it's not "every client-facing
> service is its own subgraph" — it's "each domain publishes **one** subgraph, which may
> sit atop many services."

So the graph is a **shallow aggregation layer** — a handful of domains (Catalog, Reviews,
Users, maybe Search) publish subgraphs, each fronting a whole domain.

**The router is a front door, not a service bus.** The router does exactly one job: take a
client query, split it across the subgraphs that own the requested fields, stitch the results.
It is **not** a general message bus. Backend services still talk to each other **directly** —
gRPC, REST, events — for everything that isn't "a client asked for these fields."

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

**The iceberg: what stays internal.** The graph is a thin slice near the top; most services
sit below it and never see a client query. For a Netflix-shaped app:

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

## Federation (the endgame)

- **Why federate** — one graph, many teams shipping independently; no monolithic schema, no central resolver bottleneck.
- **Subgraphs** — each service publishes its slice of the schema + resolvers + data.
- **Entities & `@key`** — a type one subgraph *owns* and others *extend* (Reviews adds `reviews` to Catalog's `Show`).
- **The Router** — query planning, `_entities` resolution, fetching across subgraphs.
- **Composition: build-time vs runtime** — schema registry, composition checks in CI, breaking-change detection; why build-time composition is the industry-standard safety net.
- **Netflix's approach** — the DGS (Domain Graph Service) framework + federation. _(cited below)_

### Federation vs schema stitching (the older way)

Before federation, the way to combine schemas was **schema stitching**: a gateway imported
each service's schema and you wrote **glue code at the gateway** to link types across services.
The problem: that glue lived in the *gateway*, so the gateway had to know about every service's
internals — a central bottleneck that every team had to coordinate through.

> **Federation flips ownership.** Each subgraph *declares* how its types extend others
> (`@key`, `@external`) **in its own schema**; the gateway/router just **composes** those
> declarations — no hand-written stitching glue. Teams evolve their slice independently; the
> router doesn't need bespoke per-service knowledge. That's why federation superseded stitching
> for large multi-team graphs.

### Field-level access governance

_(draft — captured from a discussion; the sharp enterprise concern in a federated graph)_

In a federated graph the **supergraph sees every `Type.field` from every subgraph**, and many
consumers (client apps, internal tools) query one gateway. With Personally Identifiable
Information (PII), compliance, and security in play, the enterprise question becomes: **who is
allowed to read which field?** — and, critically, when a subgraph adds a new (possibly
sensitive) field, it must **not** become blindly readable by everyone.

**Core idea (one sentence):**

> Access is granted per **(type, field) × consumer**, **default-deny**, and each grant is an
> **owner-approved request** that doubles as the permanent record.

Unpack it:

- **Per-field, not per-service.** A consumer isn't granted "the People subgraph" — it's granted
  a specific list like `Person.name`, `Person.filmography`. The unit of authorization is one field.
- **Per-consumer.** Each calling app has its own allowlist; App A's grant does nothing for App B.
- **Default-deny.** A field is unreadable until explicitly granted — *even though it's visible in
  the schema*. **Visibility ≠ authorization** (two separate layers).
- **Owner-approved.** The request routes to the team that owns the field; they consent or refuse.
- **Request = record.** Each grant is tracked (requester, exact fields, approver, timestamp) — the
  workflow *is* the audit trail.

The gateway holds a live mapping, e.g.:

```text
Person.id            → allowed for: [appA, appB, ...]
Person.name          → allowed for: [appA, ...]
Person.filmography   → allowed for: [appA, ...]
Person.agentContact  → allowed for: [ ]        ← newly added field: nobody, yet
```

**Why per-field + default-deny is the crux.** Because grants enumerate *specific* fields, a
consumer's prior approval says nothing about a field that didn't exist yet — a new field starts
with an **empty allowlist**. So adding a field can never *silently* widen who reads data; each new
field forces the owner to re-consent, per consumer. If access were **per-service**, adding a
sensitive field would leak it to every historical consumer of that service by default. Per-field
default-deny closes that hole *by construction*.

**What the system gives you:** (1) **runtime authorization** — the gateway rejects any field the
caller isn't listed for; (2) a **system of record** — reverse-lookup "who can read
`Person.agentContact`?" or "what can App X read?", with approver + timestamp; (3) **compliance** —
provable least-privilege/data-minimization, named accountability (auto-approvals get removed over
time — an auto-grant is an unaccountable grant), change safety, and fast incident scoping.

**Two distinctions worth keeping straight:**

- **Grant-time vs run-time.** The grant record answers *"can this app ever read this field?"* It
  does **not** record *"did it, when, how often?"* — that's runtime query logs/telemetry. Full
  auditability needs **both**; the grant record is not a substitute for access logging.
- **Application-field vs contextual (per-subject) authorization.** Field-level app auth answers
  *"can this app read this field type at all?"* — not *"may this session see **this customer's**
  data right now?"* The latter is a separate contextual gate. The most sensitive fields may add a
  third layer: **encryption-scoped access** (encrypted at rest; decryption needs its own grant, so
  field access ≠ plaintext access). Regulated systems tend to stack all three.

**Costs (it's not free):** developer friction (every new field a consumer needs is an approval
before shipping); approval **bottlenecks / rubber-stamping** if owners are overloaded; governance
overhead (maintaining the registry, pruning stale/orphaned grants — grants accumulate and rarely
get revoked); it's coarse at the row/subject grain (still need the contextual layer); and
**grant ≠ usage**. Good tooling (query builders, batch requests, sensible defaults for
low-sensitivity fields, clear sensitivity tiers) is what keeps the friction bearable.

**Generalizes beyond GraphQL:** any shared multi-team API surface, data-sharing platforms
(per-column grants approved by data owners), internal platform APIs that outgrew coarse
service-level roles. Minimal ingredients: a registry mapping fine-grained resources → allowed
consumers, enforcement at the gateway that consults it, an owner-routed approval workflow that
persists decisions, and **default-deny** (new resources deny-by-default).

## Production & scale

The topics that separate "I built a GraphQL server" from "I run one at scale":

- **Caching (multi-layer)** — client normalized cache · CDN/edge · **Automatic Persisted Queries (APQ)** · router response cache + `@cacheControl` · per-request DataLoader.
- **Security** — query **depth** & **complexity/cost** limits · **persisted-query safelisting** · disabling introspection in prod · field-level authorization in `context` · rate limiting.
- **Performance** — DataLoader batching · avoiding resolver waterfalls · `@defer`/`@stream` · projection push-down to data sources.
- **Reliability & ops** — partial errors & masking · timeouts/retries per subgraph · **observability** (per-resolver tracing, OpenTelemetry, Apollo traces).
- **Schema evolution** — additive-only changes · `@deprecated` fields (no versioned URLs like REST) · composition checks to block breaking changes.

### Scaling the router (how Netflix serves billions of requests)

The router is where scale concentrates — and it's designed for it:

- **Built for throughput.** The modern **Apollo Router is written in Rust** (replacing the older
  Node gateway) precisely for high performance and low overhead on the hot path — it's doing
  query planning + fan-out for every request.
- **Stateless → horizontal scale.** The router holds no per-user state; each request is
  self-contained. So you run **many identical router instances** behind a load balancer and add
  more to handle more traffic — the classic **stateless horizontal scaling** story. On
  **Kubernetes** that's just more replicas (a `Deployment` + `HorizontalPodAutoscaler`); routers
  are stateless pods, so scaling is adding pods. Netflix-scale (billions of requests) is many
  router replicas fronting the subgraphs.
- **Subgraphs evolve independently.** Each subgraph (a domain boundary) is its **own** deployable
  — its own repo, pipeline, and scaling profile. Teams ship their slice without coordinating a
  monolith deploy; the router **composes** the current set of subgraphs (service discovery points
  it at healthy subgraph instances). This independent evolvability is the organizational payoff of
  federation, not just a technical one.

_(The project keeps this simple for demo purposes — one router, subgraphs on localhost — but the
same shape scales to K8s: stateless routers as a scalable Deployment, each subgraph its own
service.)_

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
