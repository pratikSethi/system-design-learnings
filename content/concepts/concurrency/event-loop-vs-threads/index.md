---
title: Event loop vs threads
---

Two ways a server handles many concurrent requests. The choice follows the **runtime**, not
the framework — a GraphQL server on Node behaves differently from the *same* GraphQL server
on the JVM.

_(initial notes — captured from a discussion; deeper dives planned, see the [section map](../))_

## The two models

### Thread-per-request + thread pool (Tomcat, servlet containers, classic Spring MVC)

- A pool of worker threads (e.g. 200). Each request grabs **one thread** and owns it for the
  request's whole lifetime.
- If a resolver/handler does blocking I/O (JDBC, a gRPC call), that thread **parks and waits**
  — doing nothing until the I/O returns.
- Concurrency ceiling ≈ pool size. 200 threads → ~200 in-flight requests; the 201st queues.
- These are **OS (kernel) threads** — relatively heavy (~1 MB stack each), scheduled by the
  kernel. A slow downstream can exhaust the pool → **thread starvation**.

### Single-threaded event loop + async I/O (Node.js, and thus Apollo Server)

- **One main thread** runs an **event loop**. No per-request thread.
- I/O is **non-blocking**: when a handler `await`s a DB/gRPC call, the thread is **freed to run
  other requests' code** while the I/O is in flight; a callback resumes it when the I/O
  completes.
- So one thread juggles thousands of concurrent requests — as long as they're mostly
  **waiting on I/O** (which API-composition work almost always is).

```text
Tomcat:  [req] → thread#7 ──blocks on DB── (thread idle, wasted) ── responds
Node:    [req] → await db  → (thread runs OTHER requests) → resumes when db returns
```

## The crucial catch (Node): don't block the loop

Because it's **one thread**, **CPU-bound work blocks everything**. A heavy synchronous task
(big JSON parse, crypto, a tight loop) stalls the event loop, so *every* other request waits —
there's no second thread to pick up slack. Tomcat wouldn't have this problem; other threads
keep going.

Rules of thumb:

- **I/O-bound work** (DB, gRPC, HTTP) → the event loop excels. ~95% of what a GraphQL resolver does.
- **CPU-bound work** → offload it (worker threads, a separate service). Never block the loop.
- **Multiple cores** → run **multiple processes** (cluster / multiple pods behind a load
  balancer), not multiple threads. Each process = one event loop.

## OS threads vs user-level threads

The axis worth naming precisely:

- **OS / kernel threads** — scheduled by the kernel, heavyweight; what Tomcat's pool uses. A
  blocking call wastes the whole thread.
- **User-level / green / virtual threads** — many lightweight threads multiplexed onto a few
  OS "carrier" threads by a runtime scheduler (M:N). Examples: **Go goroutines**, **JVM
  Project Loom virtual threads**. They aim to keep the simple *thread-per-request coding model*
  while removing the "a blocked thread is a wasted OS thread" penalty — the runtime parks the
  virtual thread and reuses the carrier for others (conceptually close to what the event loop
  does, but you write straight-line blocking-style code).

So it's a spectrum, not a binary:

| Model | Threads | Blocking I/O cost | Example |
|---|---|---|---|
| Thread-per-request | OS threads, few | Wastes a whole OS thread | Tomcat, Spring MVC |
| Event loop | 1 thread + async | None (non-blocking) — but CPU work stalls all | Node.js, Apollo Server |
| Virtual / green threads | Many user threads on few OS threads | Cheap — runtime parks & reuses carrier | Go, JVM Loom |

## Why this matters for GraphQL specifically

- **The concurrency model follows the host runtime.** GraphQL-on-Node (Apollo) = event loop.
  GraphQL-on-JVM (**Netflix DGS**, on Spring) = thread-per-request / reactive. Same spec,
  different execution model.
- **Parallel resolvers "for free" on Node:** a query needing `title` (DB) + `availability`
  (gRPC) + `bingeScore` (gRPC) fires all three `await`s concurrently on one thread — they're
  just waiting on I/O.
- **N+1 is a *volume/latency* problem here, not a *blocking* one:** 20 sequential `cast` calls
  don't freeze a Node server (the loop stays responsive), but they cost 20 round-trips of
  latency and load. [DataLoader](../../networking/graphql/) batches them within one event-loop
  tick → 1 call. The fix targets latency + downstream load, which fits the async model.

## Takeaway (recall)

> A server's concurrency model follows its **runtime**. **Thread-per-request** (Tomcat) is
> simple but a blocking call wastes an OS thread → pool-bound. **Event loop** (Node/Apollo)
> scales by never blocking on I/O (one thread, thousands of waits) but must never run CPU
> work on the loop, and uses *processes* for cores. **Virtual/green threads** (Go, JVM Loom)
> try to get both: thread-per-request code, event-loop-like efficiency.

## To go deeper (planned)

- Node event loop internals (phases, microtasks, the `libuv` thread pool that *does* exist for fs/DNS).
- Project Loom vs the event loop — same goal, different mechanism.
- I/O-bound vs CPU-bound — how to measure which you have, and which model wins.
- How Netflix DGS handles concurrency on the JVM.
