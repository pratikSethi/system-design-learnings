// RESOLVERS — the functions that produce the data for each field in the schema.
//
// A resolver map mirrors the schema's shape: for each type, an object of field-name →
// function. Apollo calls the matching resolver when a client asks for that field.
//
// Key idea: a resolver is THIN. Its job is to delegate to a data source and return plain
// data — not to hold business logic or talk to a DB directly. Here `Query.shows` just
// asks the data layer for the list.
//
// Fields we DON'T write a resolver for (id, title, releaseYear, ...) use Apollo's
// "default resolver": it simply reads the property of the same name off the returned
// object. That's why returning the plain Show objects from data/ is enough.

import type { Resolvers } from "../generated/graphql.js";
import { findAllShows, findShowById } from "../data/shows.js";
import { findCastForShow } from "../data/people.js";

// `Resolvers` is generated from the SDL (npm run codegen). Typing the map with it
// means TypeScript checks every resolver AGAINST the schema: field names, argument
// types, and return types must match shows.graphql — no more hand-written arg types
// that can silently drift. Change the schema, re-run codegen, and mismatches become
// compile errors here.
export const resolvers: Resolvers = {
  Query: {
    // (parent, args, context, info) — none needed yet for a plain list.
    shows: () => findAllShows(),

    // `args` is now typed from the schema (QueryShowArgs → { id: string }); we didn't
    // write that shape by hand. Nullable return is allowed because the SDL says `Show`, not `Show!`.
    // Must `await` now that the data layer is async: findShowById returns a Promise, so the
    // `?? null` has to apply to the resolved value (undefined → null), not the Promise itself.
    show: async (_parent, args) => (await findShowById(args.id)) ?? null,
  },

  // A FIELD RESOLVER on the Show type. Unlike a Query resolver (a top-level entry point),
  // this runs for EACH Show object once `cast` is requested. The first param, `parent`, is
  // the Show this cast belongs to — so we read parent.id and fetch that show's cast.
  //
  // THIS is where N+1 is born: for `shows { cast { name } }`, Apollo runs this resolver once
  // per show in the list → one findCastForShow() call per show. Watch the logs.
  Show: {
    cast: (parent) => findCastForShow(parent.id),
  },
};
