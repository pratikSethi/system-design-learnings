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

## Does the event loop use multiple cores? No — one loop, one core

A single Node event loop is one thread, and one thread runs on **one core** at a time. So a
single Node process saturates **one core** no matter how many requests it juggles; the other
15 sit idle for that process. You get multi-core the same way you scale out: **many loops, one
per core** — not one loop spread across cores.

Two mechanisms:

1. **Multiple processes (the main answer).** Run ~one Node process per core, each with its own
   loop. Via the `cluster` module on one box, or (more common at scale) N container replicas
   behind a load balancer.
2. **Worker threads (the exception, for CPU work).** `worker_threads` are real OS threads
   *inside* one process — **not** for serving requests, but to offload CPU-bound work
   (crypto, image resize) onto another core so the main loop stays responsive.

Nuance — the hidden **libuv thread pool**: even "single-threaded" Node keeps a small pool
(default 4) for operations with no async OS primitive — filesystem I/O, DNS, some crypto.
Network I/O (sockets, your gRPC/HTTP) uses the OS's native async facilities (epoll/kqueue) and
does **not** consume that pool. So the *event loop* is one thread; libuv quietly parallelizes a
few blocking syscalls behind it.

> Precise version of "Node is single-threaded": the **event loop is single-threaded per
> process**; multi-core parallelism comes from running **multiple processes**, not from
> parallelizing one loop.

### How are requests balanced across those processes?

"Load balancer" means two different things at two scales — and the same-machine one surprises
people:

| Layer | What's balanced | Who does it | Separate tool? |
|---|---|---|---|
| Within one machine | processes / cores | **the OS kernel** (shared socket) | **No** — built in |
| Across machines | hosts / pods | nginx, HAProxy, cloud LB, k8s Service | Yes |

**Within one machine — the kernel is the load balancer.** There is no registry of processes and
no separate LB. With the `cluster` module, a master binds **one** socket to the port and shares
that file descriptor with all workers; every worker `accept()`s the **same** socket, and the
**kernel** hands each new connection to one worker. Nobody maintains a process list — the kernel
already knows who's waiting on that socket.

```text
              port 4001  (one shared socket)
                    │
            ┌───────┴───────┐   kernel hands each new
            │  OS kernel    │   connection to ONE worker
            └───────┬───────┘
      ┌──────┬──────┼──────┬────────┐
   worker1 worker2 worker3 ...   worker16
   (core1) (core2) (core3)       (core16)
```

Two strategies: **`SCHED_RR`** (Node's default — master accepts, hands to workers round-robin)
or **`SO_REUSEPORT`** (each worker binds its own socket on the same port; the kernel hashes
connections across them — also used by nginx/Envoy). Either way the balancing lives in the
**kernel**, not a tool you install.

**Across machines — now you need a real load balancer** that maintains a list of backends, kept
fresh by **health checks** or **service discovery** (the endpoint-discovery / xDS machinery from
the [gRPC note](../../networking/grpc/)): nginx/HAProxy, a cloud LB (AWS ALB/NLB), or Kubernetes'
Service + kube-proxy.

Both stack in production: a cloud LB spreads requests across **pods** (cross-machine), and each
pod is typically a **single** Node process owning its core. That's why cloud-native Node often
**skips `cluster`** — Kubernetes already gives multi-core parallelism by scheduling many
single-process pods across machines. Same principle (one loop per core), higher altitude.

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
