// The REVIEWS data source — a fake in-memory "database", the reviews subgraph's own store.
// Async + logged, like catalog's, to simulate a real backend call.
//
// Reviews are keyed by `showId` — the SAME id catalog uses for Show. That shared id is the
// federation @key: it's how a review row ties back to a Show that another service owns.

import { sleep } from "./sleep.js";

export interface Review {
  id: string;
  showId: string; // references catalog's Show.id (the @key) — like a foreign key
  rating: number;
  comment?: string;
}

const REVIEWS: Review[] = [
  { id: "r1", showId: "1", rating: 5, comment: "Upside down and unmissable." },
  { id: "r2", showId: "1", rating: 4, comment: "Kids carry it." },
  { id: "r3", showId: "2", rating: 5, comment: "Scorsese epic." },
  { id: "r4", showId: "3", rating: 4, comment: "Ortega is magnetic." },
  { id: "r5", showId: "3", rating: 3 },
  { id: "r6", showId: "5", rating: 5, comment: "Every episode a chess match." },
  // note: show "4" (Glass Onion) has no reviews yet → averageRating should be null
];

/** All reviews for one show. Stands in for `SELECT * FROM reviews WHERE show_id = ?`. */
export async function findReviewsForShow(showId: string): Promise<Review[]> {
  console.log(`  [reviews-backend] findReviewsForShow(${showId})`);
  await sleep(30);
  return REVIEWS.filter((r) => r.showId === showId);
}
