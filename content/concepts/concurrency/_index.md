---
title: Concurrency
---

How a server handles many requests at once — the models (threads, event loops, async
I/O), their tradeoffs, and when each wins. Cross-cutting: the same concepts show up in
web servers, GraphQL servers, databases, and language runtimes.

## Written

{{< cards >}}
  {{< card link="event-loop-vs-threads" title="Event loop vs threads" icon="switch-horizontal" subtitle="Thread-per-request vs single-threaded async; OS vs user-level threads." >}}
{{< /cards >}}

{{< details title="Planned topics" closed="true" >}}

- **Node.js event loop internals** — phases (timers, poll, check), the microtask queue, `libuv` thread pool for fs/DNS, what actually blocks the loop.
- **Project Loom (JVM virtual threads)** — thread-per-request *coding model* on top of a small number of OS carrier threads; how it removes the "blocking wastes a thread" penalty.
- **Goroutines & the Go scheduler** — M:N scheduling, user-level threads, work-stealing.
- **I/O-bound vs CPU-bound** — the deciding axis for which model wins; how to tell which you have.
- **How Netflix DGS handles concurrency** — GraphQL on the JVM (Spring), reactive vs blocking, contrast with Node/Apollo.
- **Reactive / async frameworks** — event-driven vs virtual-thread approaches to the same problem.

{{< /details >}}
