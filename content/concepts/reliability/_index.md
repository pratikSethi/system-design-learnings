---
title: Reliability
---

Cross-cutting techniques for making distributed calls fast and robust — they apply to
any Remote Procedure Call (RPC) system, database, or queue, not one specific technology.
Split roughly into **tail-latency** tricks and **failure-handling** patterns (many do both).

{{< callout type="info" >}}
The foundational reading for the latency side is *The Tail at Scale* — Jeffrey Dean &
Luiz André Barroso, Communications of the ACM (2013). It popularized hedged and tied
requests.
{{< /callout >}}

## Written

{{< cards >}}
  {{< card link="reliability-vs-availability" title="Reliability vs. Availability" icon="scale" subtitle="Two words people conflate — and why uptime can lie." >}}
  {{< card link="request-hedging" title="Request Hedging" icon="lightning-bolt" subtitle="Cut tail latency by racing duplicate requests." >}}
{{< /cards >}}

{{< details title="Planned topics" closed="true" >}}

- **Backoff + jitter** — exponential backoff, why jitter matters (avoiding synchronized retry storms)
- **Circuit breakers** — closed/open/half-open; failing fast to protect a struggling dependency
- **Idempotency** — idempotency keys; making retries safe for writes
- **Load shedding** — dropping low-priority work under overload to stay up
- **Bulkheads** — isolating resource pools so one failure doesn't sink the whole ship
- **Timeouts & deadlines** — deadline propagation across a call chain
- **Thundering herd / cache stampede** — and mitigations (request coalescing, jittered TTLs)

{{< /details >}}
