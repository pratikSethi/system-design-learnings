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
import type { Context } from "../context.js";
import { findAllShows, findShowById } from "../data/shows.js";

// `Resolvers<Context>` is generated from the SDL (npm run codegen). Typing the map with it
// means TypeScript checks every resolver AGAINST the schema: field names, argument types,
// and return types must match shows.graphql — no more hand-written arg types that can
// silently drift. Passing <Context> also types the 3rd resolver arg (our loaders).
export const resolvers: Resolvers<Context> = {
  Query: {
    // (parent, args, context, info) — none needed yet for a plain list.
    shows: () => findAllShows(),

    // `args` is now typed from the schema (QueryShowArgs → { id: string }); we didn't
    // write that shape by hand. Nullable return is allowed because the SDL says `Show`, not `Show!`.
    // Must `await` now that the data layer is async: findShowById returns a Promise, so the
    // `?? null` has to apply to the resolved value (undefined → null), not the Promise itself.
    show: async (_parent, args) => (await findShowById(args.id)) ?? null,
  },

  // A FIELD RESOLVER on the Show type. Runs for EACH Show once `cast` is requested.
  //
  // THE FIX: instead of fetching directly (one call per show → N+1), we hand the show's id
  // to the DataLoader via .load(). Each call returns a Promise immediately WITHOUT fetching;
  // DataLoader collects every id requested in this event-loop tick and calls the batch
  // function (findCastForShows) ONCE with all of them. The 3rd arg is our typed context.
  //   before: cast: (parent) => findCastForShow(parent.id)        // N calls
  //   after:  cast: (parent, _args, ctx) => ctx.loaders...load()  // 1 batched call
  Show: {
    cast: (parent, _args, ctx) => ctx.loaders.castByShowId.load(parent.id),
  },
};
