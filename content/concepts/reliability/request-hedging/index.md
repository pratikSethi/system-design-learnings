---
title: Request Hedging
---

A tail-latency optimization: send the **same** request to more than one replica, use the
**first** response that comes back, and cancel the rest. It trades a little extra load for
a large cut in *tail* latency (p99 / p999).

## The problem it solves

In any large system, a single request often fans out to many backends, and the *slowest*
one dictates the user-visible latency. Even if each backend is fast on average, the
occasional slow response (a garbage-collection pause, a cold cache, a busy disk, a noisy
neighbor) means that at scale **some** request in a fan-out is almost always slow. So the
*tail* (p99, p999) is far worse than the *median*, and the more backends you touch, the
worse it gets.

You can't easily make every backend uniformly fast. But you *can* stop waiting on an
unlucky-slow one.

## The idea

```text
                    ┌────────────▶ replica A   (slow this time — GC pause)
  request ──hedge──▶├────────────▶ replica B   ✅ responds first → use this
                    └────────────▶ replica C   (cancelled)
```

- Fire the request to N replicas (either immediately, or — better — after a short delay).
- Take the first successful response.
- Cancel the outstanding duplicates so they don't waste work.

### Hedging vs retries (the key distinction)

- **Retry:** wait for a failure (or timeout), *then* try again. Reactive — you've already
  eaten the slow/failed attempt's latency.
- **Hedge:** send the duplicate *before* the first has failed, in parallel. Proactive —
  you're racing against slowness, not reacting to failure.

### Tied requests (the refinement)

Naive hedging can double or triple load. *The Tail at Scale* describes **tied requests**:
send to two replicas but have them *tell each other* once one starts executing, so the
other cancels early. This gets most of the tail-latency benefit for far less wasted work.

## The cost / when NOT to hedge

- **Extra load.** Hedging multiplies request volume; under high utilization that added
  load can *worsen* latency for everyone. Usually you only hedge the small fraction of
  requests that exceed a latency threshold (e.g. hedge after the 95th-percentile delay),
  keeping the overhead to a few percent.
- **Must be idempotent (for writes).** Racing duplicates of a non-idempotent write can
  double-apply. Safe by default for reads; for writes you need idempotency (see planned
  *Idempotency* note).
- **Cancellation must actually work**, or you pay full cost on every hedge.

## In gRPC

gRPC supports hedging declaratively via its **retry/hedging service config** — no
application code. You set a hedging policy (max attempts, hedging delay) and gRPC fires
the extra attempts and cancels losers for you.

- [gRPC retry & hedging design](https://github.com/grpc/proposal/blob/master/A6-client-retries.md)
- [gRPC service config docs](https://grpc.io/docs/guides/retry/)

Related: this is one reason gRPC prefers **deadlines** (propagated across hops) over local
timeouts — see the gRPC note's RPC-lifecycle section.

## Resources

- **_The Tail at Scale_** — Jeffrey Dean & Luiz André Barroso, *Communications of the ACM*, Feb 2013. The paper; introduces hedged and tied requests. (Freely available as a PDF — search the title.)
- **_Site Reliability Engineering_** (Google, O'Reilly) — chapters on handling overload & addressing cascading failures.

## Quick self-check

1. How does hedging differ from a retry, and why does that make it better for tail latency?
2. Why do you usually hedge only requests that have *already* exceeded some latency threshold?
3. What's a "tied request" and what problem with naive hedging does it fix?
4. Why is hedging safe for reads but risky for writes?
