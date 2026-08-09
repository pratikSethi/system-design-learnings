// The SHOWS data source — a fake in-memory "database".
//
// This is the seam that, in production, would be replaced by a call to the Catalog
// team's real backend (a gRPC/REST service + database). The resolver never talks to a
// DB directly; it goes through a data source like this one. Keeping that boundary here
// from day 1 means later steps swap the *implementation* without touching resolvers.
//
// The functions are ASYNC and add artificial latency (via `sleep`) to FAITHFULLY SIMULATE
// a real backend call: it (a) returns a Promise, (b) takes time, and (c) is non-blocking
// (the event loop is free while it's in flight — see the concurrency note). The console.log
// makes each call countable in the terminal — how we SEE the N+1 problem later.
//
// Cast/People live in a separate source (./people.ts) — Show rows carry NO cast, which is
// what forces a per-show fetch and creates the N+1.

import { sleep } from "./sleep.js";

export type ShowKind = "MOVIE" | "SERIES";

export interface Show {
  id: string;
  title: string;
  releaseYear: number;
  kind: ShowKind;
  maturityRating: string;
}

const SHOWS: Show[] = [
  { id: "1", title: "Stranger Things",   releaseYear: 2016, kind: "SERIES", maturityRating: "TV-14" },
  { id: "2", title: "The Irishman",      releaseYear: 2019, kind: "MOVIE",  maturityRating: "R" },
  { id: "3", title: "Wednesday",         releaseYear: 2022, kind: "SERIES", maturityRating: "TV-14" },
  { id: "4", title: "Glass Onion",       releaseYear: 2022, kind: "MOVIE",  maturityRating: "PG-13" },
  { id: "5", title: "The Queen's Gambit", releaseYear: 2020, kind: "SERIES", maturityRating: "TV-MA" },
];

/** Return every show. Stands in for `SELECT * FROM shows` / a gRPC ListShows call. */
export async function findAllShows(): Promise<Show[]> {
  console.log("  [backend] findAllShows()");
  await sleep(50); // pretend the round-trip took ~50ms
  return SHOWS;
}

/**
 * Find one show by id, or undefined if none matches. Stands in for
 * `SELECT * FROM shows WHERE id = ?` / a gRPC GetShow call.
 */
export async function findShowById(id: string): Promise<Show | undefined> {
  console.log(`  [backend] findShowById(${id})`);
  await sleep(30);
  return SHOWS.find((show) => show.id === id);
}

