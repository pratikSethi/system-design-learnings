// SERVER ENTRYPOINT — the reviews subgraph. Same shape as catalog-service:
// buildSubgraphSchema exposes _service/_entities so the router can compose and query it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { gql } from "graphql-tag";
import type { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";

import { resolvers } from "./resolvers/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = gql(readFileSync(join(__dirname, "schema/reviews.graphql"), "utf-8"));

const server = new ApolloServer({
  schema: buildSubgraphSchema({
    typeDefs,
    resolvers: resolvers as GraphQLResolverMap<unknown>,
  }),
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4002 }, // reviews subgraph → 4002 (catalog 4001, router 4000)
});

console.log(`⭐ reviews-service ready at ${url}`);
