---
title: Networking
---

Notes on networking for system design — organized to go **broad** (one place for
the whole landscape) and **deep** on each topic, with primary sources: specs/RFCs,
engineering blogs, conference talks, and papers.

Each topic gets its own page as I write it up. This page is the map.

## Written

{{< cards >}}
  {{< card link="grpc" title="gRPC" icon="chip" subtitle="RPC over HTTP/2 + Protocol Buffers." >}}
{{< /cards >}}

{{< details title="Planned topics" closed="true" >}}

### The stack (fundamentals)
- **OSI / request lifecycle** — layers 3/4/7; what happens on `GET example.com` (DNS → TCP handshake → HTTP → teardown)
- **L3 — Network:** IP addressing, routing, public vs private, NAT, DHCP

### L4 — Transport protocols
- **TCP** — 3-way handshake, streams, ordering, flow & congestion control, head-of-line blocking
- **UDP** — connectionless, best-effort; when loss is acceptable (media, gaming, VoIP)
- **QUIC / HTTP/3** — TCP+TLS reimagined over UDP; 0-RTT; per-stream loss recovery

### L7 — Application protocols
- **REST** — resources/verbs, idempotency, status codes, pagination
- **GraphQL** — over/under-fetching, resolvers, N+1, persisted queries, federation
- **HTTP evolution** — HTTP/1.1 → /2 (multiplexing, HPACK) → /3 (QUIC); keep-alive
- **Realtime family** (the "how do I push to a client?" decision):
  - **SSE** — `EventSource`, reconnection, `Last-Event-ID`, proxy buffering gotchas
  - **WebSockets** — HTTP upgrade, bidirectional, framing; infra pain (LBs/proxies/firewalls)
  - **Long polling** — the fallback; how it differs from SSE
  - **WebRTC** — P2P over UDP; STUN/TURN/ICE, signaling, NAT traversal
  - **Realtime decision** — polling vs long-poll vs SSE vs WebSocket vs WebRTC (tradeoff table)

### Load balancing & proxies
- **Load balancing** — L4 vs L7, client-side vs dedicated, algorithms, health checks, failover
- **Envoy** — modern L7 proxy; the xDS APIs (LDS/RDS/CDS/EDS); basis of service meshes
- **API Gateway** — auth, TLS termination, rate limiting, routing; vs plain LB

### Datacenter & cloud networking
- **North-south vs east-west** — ingress/egress vs service-to-service traffic
- **Sidecar & service mesh** — sidecar pattern, Envoy dataplane, Istio/Linkerd, mTLS
- **Kubernetes networking** — Pod IPs, ClusterIP / NodePort / LoadBalancer, kube-proxy, CNI, Ingress
- **iptables & the packet path** — netfilter hooks, DNAT/SNAT, conntrack
- **eBPF** — programmable kernel dataplane; Cilium (iptables replacement), Katran (L4 LB), XDP
- **DNS deep dive** — resolution, records, TTLs, GeoDNS, DNS as load balancing

### Latency, reliability & failure
- **Regionalization & CDN** — speed-of-light latency, data locality, edge, regional partitioning
- **Failure patterns** — timeouts, retries + exponential backoff + jitter, idempotency keys, circuit breakers, thundering herd
- **TLS** — handshake, termination points, mTLS

### Cross-cutting references (to fold into topic pages)
- **RFCs / specs:** [HTTP/2 (9113)](https://www.rfc-editor.org/rfc/rfc9113.html) · [HTTP/3 (9114)](https://www.rfc-editor.org/rfc/rfc9114.html) · [QUIC (9000)](https://www.rfc-editor.org/rfc/rfc9000.html) · [WebSocket (6455)](https://www.rfc-editor.org/rfc/rfc6455.html) · [SSE (WHATWG)](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- **Books:** _High Performance Browser Networking_ — Ilya Grigorik ([free online](https://hpbn.co)) · _Computer Networking: A Top-Down Approach_ — Kurose & Ross
- **Hands-on:** Wireshark (watch real packets) · macOS Network Link Conditioner (simulate latency/loss)

{{< /details >}}
