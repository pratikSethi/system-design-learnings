// The PEOPLE data source — a SEPARATE backend from shows (a People/Talent service in
// production). Kept in its own file precisely because it's an independent source: the
// Show data source has no `cast` embedded, so resolving a show's cast requires a call
// *here*. That separation is the seed of the N+1 problem.
//
// (Design A: each call returns a show's WHOLE cast, names included, so N+1 lives at the
// shows→cast level, triggered by the LIST query `shows { cast { name } }`.)
//
// At step 4 (federation) this file is the natural thing to extract into its own People
// subgraph — it's already isolated.

import { sleep } from "./sleep.js";

export interface Person {
  id: string;
  name: string;
}

const PEOPLE: Record<string, Person> = {
  p1: { id: "p1", name: "Millie Bobby Brown" },
  p2: { id: "p2", name: "David Harbour" },
  p3: { id: "p3", name: "Robert De Niro" },
  p4: { id: "p4", name: "Al Pacino" },
  p5: { id: "p5", name: "Jenna Ortega" },
  p6: { id: "p6", name: "Daniel Craig" },
  p7: { id: "p7", name: "Anya Taylor-Joy" },
};

// Which people are in which show. Note p7 (Anya Taylor-Joy) appears in BOTH
// Glass Onion (4) and The Queen's Gambit (5) — a shared person that DataLoader's
// per-request cache will later fetch only once.
const CAST_BY_SHOW: Record<string, string[]> = {
  "1": ["p1", "p2"],
  "2": ["p3", "p4"],
  "3": ["p5"],
  "4": ["p6", "p7"],
  "5": ["p7"],
};

/**
 * Return the full cast (people, names included) for ONE show. Stands in for a
 * per-show call to the People service, e.g. `GetCastForShow(showId)`.
 *
 * This is invoked once per show by the `Show.cast` resolver — so a LIST query
 * over many shows calls it N times: the N+1 problem, visible in the logs.
 */
export async function findCastForShow(showId: string): Promise<Person[]> {
  console.log(`  [backend] findCastForShow(${showId})`);
  await sleep(30);
  const ids = CAST_BY_SHOW[showId] ?? [];
  // filter(Boolean) drops any id with no matching person; the cast<Person> makes
  // TS treat the result as Person[] (indexing a Record can yield undefined).
  return ids.map((id) => PEOPLE[id]).filter(Boolean) as Person[];
}

/**
 * BULK version: cast for MANY shows in ONE call. Stands in for a batch endpoint like
 * `BatchGetCastForShows([ids])` or a `WHERE show_id IN (...)` query. This is what
 * DataLoader calls once per batch — the whole point is that it does a SINGLE fetch for
 * every id, NOT a loop of single fetches.
 *
 * Contract required by DataLoader: return an array the SAME LENGTH and SAME ORDER as the
 * input — result[i] must be the cast for showIds[i]. We build a per-show list up front
 * and map back positionally so the alignment always holds (even for ids with no cast).
 */
export async function findCastForShows(showIds: readonly string[]): Promise<Person[][]> {
  console.log(`  [backend] findCastForShows([${showIds.join(", ")}])`);
  await sleep(30); // ONE round-trip for all ids
  return showIds.map((showId) => {
    const personIds = CAST_BY_SHOW[showId] ?? [];
    return personIds.map((id) => PEOPLE[id]).filter(Boolean) as Person[];
  });
}
