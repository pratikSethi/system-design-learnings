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

import { findAllShows } from "../data/shows.js";

export const resolvers = {
  Query: {
    // (parent, args, context, info) — none needed yet for a plain list.
    shows: () => findAllShows(),
  },
};
