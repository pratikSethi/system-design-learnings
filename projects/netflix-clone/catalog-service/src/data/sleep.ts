/**
 * Resolve after `ms` milliseconds — a non-blocking delay used to simulate backend
 * latency. setTimeout hands the timer to the event loop and returns immediately, so the
 * single thread stays free to do other work while this "call" is in flight (exactly how
 * real async I/O behaves — see the concurrency note). Shared by the fake data sources.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
