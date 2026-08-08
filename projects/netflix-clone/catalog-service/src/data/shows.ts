// The DATA layer — a fake in-memory "database" for step 1.
//
// This is the seam that, in production, would be replaced by a call to the Catalog
// team's real backend (a gRPC/REST service + database). The resolver never talks to a
// DB directly; it goes through a data source like this one. Keeping that boundary here
// from day 1 means later steps swap the *implementation* without touching resolvers.

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
export function findAllShows(): Show[] {
  return SHOWS;
}
