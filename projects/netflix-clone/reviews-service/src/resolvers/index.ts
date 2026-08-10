// RESOLVERS for the reviews subgraph.
//
// The federation flow for a query like `{ shows { title reviews { rating } } }`:
//   1. The router gets `title` from catalog, then hands US a Show REFERENCE — { __typename:
//      "Show", id } — for each show, because we contribute the `reviews` field.
//   2. Show.__resolveReference turns that reference into a parent object. We DON'T own Show
//      data, so we just pass the id through — that's all our field resolvers need.
//   3. Show.reviews / Show.averageRating run with that parent and fetch OUR review data by id.

import type { Resolvers } from "../generated/graphql.js";
import { findReviewsForShow } from "../data/reviews.js";

export const resolvers: Resolvers = {
  Show: {
    // We don't own Show — just acknowledge the reference by passing its id through.
    __resolveReference: (ref) => ({ id: ref.id }),

    reviews: (show) => findReviewsForShow(show.id),

    averageRating: async (show) => {
      const reviews = await findReviewsForShow(show.id);
      if (reviews.length === 0) return null; // no reviews yet → null (schema allows it)
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      return parseFloat((sum / reviews.length).toFixed(2));
    },
  },
};
