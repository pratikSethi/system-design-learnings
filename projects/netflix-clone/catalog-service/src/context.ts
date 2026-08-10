// The per-request CONTEXT — the object Apollo threads into every resolver as its 3rd
// argument (parent, args, context, info). It's the place for anything scoped to a single
// request: DataLoaders now, and later things like the authenticated user.
//
// Why DataLoaders live here (and not as a module-level singleton): a DataLoader has a
// per-request CACHE. Building a fresh one PER REQUEST means (a) the cache resets each
// request, and (b) one caller's cached data can never leak into another's. A shared,
// long-lived loader would be a correctness + security bug.

import DataLoader from "dataloader";

import type { Person } from "./data/people.js";
import { findCastForShows } from "./data/people.js";

// The shape every resolver sees as `context`.
export interface Context {
  loaders: {
    // key = showId, value = that show's cast. DataLoader<Key, Value>.
    castByShowId: DataLoader<string, Person[]>;
  };
}

// Build a brand-new set of loaders. Called once per incoming request (see index.ts).
export function createContext(): Context {
  return {
    loaders: {
      // The batch function receives ALL the showIds collected during one event-loop tick
      // and must return results in the SAME ORDER — findCastForShows already guarantees that.
      castByShowId: new DataLoader<string, Person[]>((showIds) =>
        findCastForShows(showIds),
      ),
    },
  };
}
