/**
 * Resolve after `ms` milliseconds — a non-blocking delay used to simulate backend latency.
 * (Same helper as the catalog subgraph; each service is self-contained.)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
