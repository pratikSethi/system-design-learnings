---
title: Reliability vs. Availability
---

Two words that get used interchangeably but mean different things — and the difference
changes how you monitor and design systems.

## The one-line distinction

- **Reliability** — does the system produce **correct results** and avoid failure? *"Does it work properly?"* (correctness **over time**)
- **Availability** — is the system **reachable and able to serve a request right now**? *"Can I use it at this moment?"* (serviceability **at a point in time**)

## They're independent — the quadrant

The trap is assuming "up = working." A system can be available but wrong, or correct but
unreachable:

|  | Available | Not available |
|---|---|---|
| **Reliable** | ✅ The goal — up *and* returning correct results | Correct whenever it runs, but often down (e.g. an accurate job that only runs nightly) |
| **Unreliable** | Up and answering, but returns **wrong / corrupt** data | ❌ Worst case — down *and* broken |

The two off-diagonal cells are the ones people forget:

- **Available but unreliable** — an API that always answers `200 OK` but returns stale or wrong data. Reachable, useless.
- **Reliable but unavailable** — perfectly correct whenever it runs, but only up 90% of the time.

You want both — but they're pursued with *different* techniques, which is why they're
worth separating.

## How each is measured

**Availability** — a percentage of successful service, the famous "nines":

| Target | Downtime budget / year |
|---|---|
| 99% ("two nines") | ~3.65 days |
| 99.9% ("three nines") | ~8.76 hours |
| 99.99% ("four nines") | ~52.6 minutes |
| 99.999% ("five nines") | ~5.26 minutes |

Formally: `Availability = MTBF / (MTBF + MTTR)`, where **MTBF** is Mean Time Between
Failures and **MTTR** is Mean Time To Repair.

**Reliability** — measured over a *duration*, via metrics like **MTBF**, **MTTF** (Mean
Time To Failure, for non-repairable components), and failure/error rate.

{{< callout type="info" >}}
The `MTBF / (MTBF + MTTR)` formula reveals a key insight: you can reach high
**availability** two different ways — fail **rarely** (high reliability), *or* fail often
but **recover almost instantly** (tiny MTTR). Self-healing systems bet on the second:
things still break, but recovery is so fast that availability stays high. High
availability does **not** require high reliability.
{{< /callout >}}

## Availability is client-perceived — not "is the process up"

The crude formula `Uptime / (Uptime + Downtime)` hides an ambiguity: **up as measured by
whom, and up to do what?** The honest definition of availability is not "the server
process is running." It's:

> The probability that a request receives a **correct, successful response within
> acceptable latency** — measured **as the client experiences it**.

Uptime is just a convenient (and often misleading) proxy for that.

### A scenario where uptime lies: server certificate rotation

Consider rotating the Transport Layer Security (TLS) certificate on your servers. The new
certificate chains to a Certificate Authority (CA) that your **clients' trust store
doesn't recognize** — the clients weren't updated with the new CA bundle. Every server
process is healthy, every port is listening, every dashboard is green. And yet **no
customer can use the service.** What are clients actually seeing?

Walk the request path in order:

```text
client → TCP connect → TLS handshake → (auth) → app logic → response
                       ▲
                 fails HERE — client rejects the server's new cert
```

1. **TCP connect (transport, Layer 4) — succeeds.** The Transmission Control Protocol
   (TCP) three-way handshake completes: the server is listening and accepts the
   connection. Nothing is refused at this layer.
2. **TLS handshake — fails.** On that live connection, the server presents its **new**
   certificate. The **client** validates it against its local trust store, doesn't find a
   trusted issuer, and **aborts** with a TLS alert.

{{< callout type="warning" >}}
This is **not** a "connection refused" error. `Connection refused` (`ECONNREFUSED`) is a
*transport-layer* failure — it means nothing is listening, or a firewall sent a RST,
*before* any TLS. Here the TCP connection **succeeds** and the failure is a **certificate
validation error** during the TLS handshake. Typical client-side messages:
`certificate signed by unknown authority` (Go), `unable to get local issuer certificate`
(OpenSSL), `SSLCertVerificationError` (Python), `PKIX path building failed` (Java).
{{< /callout >}}

**The critical asymmetry:** in this case the **client** does the rejecting, because the
client validates the *server's* certificate. From the server's perspective it presented a
valid cert and did nothing wrong — it just sees connections dropped after sending its
certificate. That is precisely why server-side health and uptime stay green while
customers are fully down.

> Caveat — *who* rejects depends on *whose* cert is wrong. In **mutual TLS (mTLS)**, where
> the client also presents a certificate, a bad *client* cert is rejected by the
> **server** (so the server would see the errors). The scenario above — server cert
> rotated, clients not updated to trust it — is the client-side-rejection case, so
> "server thinks it's healthy" holds exactly.

So during this incident:

- **Server process uptime:** 100% ✅
- **Actual availability (the metric that matters):** ~0% ❌ — an active, customer-facing outage.

The uptime number wasn't lying about *the process*; it was measuring the **wrong link** in
the request chain. Availability is a property of the **whole path**, judged **at the
client**.

## The monitoring lesson: black-box beats white-box for availability

This is the textbook argument for **black-box (client-side) monitoring** over **white-box
(server-side) monitoring**:

- **White-box** health checks ask "is the process alive? CPU/memory OK?" → all **green**
  during the cert incident, because the handshake fails *before* reaching the code that
  reports health.
- **Black-box** probes act like a real external client: complete a real request
  end-to-end, **through the same TLS path customers use**. This goes **red** immediately
  and matches reality.

A health check that connects *without* traversing the same TLS/cert path as customers is
a "lying green." Probe the way your clients connect.

## Saying it formally: SLI / SLO

The industry resolves the "up for whom?" ambiguity with **Service Level Indicators**:

- An **SLI** (Service Level Indicator) *defines what "available" means for this service* —
  e.g. "fraction of requests that return a non-error response, over TLS, within 50 ms,
  measured at the client edge."
- An **SLO** (Service Level Objective) is the target for that SLI (e.g. 99.99%).

Under a client-centric SLI, the cert incident **counts as downtime** — exactly as it
should. Under a lazy "process uptime" SLI, it wouldn't, which is how teams report green
dashboards during real outages. The fix isn't better servers; it's **defining
availability from the client's perspective.**

## How this maps to the reliability patterns

The distinction lines up with the techniques in this section:

- **Reliability-oriented** (correct results): idempotency (safe retries), circuit breakers
  (stop cascading corruption/failure), backoff (don't amplify failures).
- **Availability-oriented** (served right now): redundancy/replication, fast failover (low
  MTTR), and [Request Hedging](../request-hedging/) — which doesn't make any single
  backend more *reliable*, it improves *availability/latency* by not depending on an
  unlucky-slow or unreachable replica.

## Quick self-check

1. Give an example of a system that is **available but unreliable**, and one that is **reliable but unavailable**.
2. Two systems both hit 99.99% availability — one via high MTBF, one via low MTTR. How do they differ in behavior?
3. In the cert-rotation scenario, why does the client see a TLS error rather than "connection refused"?
4. Why did server-side monitoring stay green during that outage, and what kind of monitoring would have caught it?
5. Why is "process uptime" a poor SLI, and what makes a good one?
