// SERVER ENTRYPOINT — wires the schema + resolvers together and starts Apollo Server
// as a FEDERATION SUBGRAPH.
//
// The flow:
//   1. Read the SDL (.graphql) file  → the type definitions ("typeDefs").
//   2. Import the resolver map        → the functions behind each field.
//   3. buildSubgraphSchema            → builds an executable schema PLUS the federation
//      machinery (_service, _entities) the router uses to fetch/resolve entities by @key.
//   4. startStandaloneServer          → an HTTP server that also serves Apollo Sandbox.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { gql } from "graphql-tag";
import type { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";

import { resolvers } from "./resolvers/index.js";
import { type Context, createContext } from "./context.js";

// Resolve the schema path relative to THIS file (works regardless of cwd).
const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = gql(readFileSync(join(__dirname, "schema/shows.graphql"), "utf-8"));

// buildSubgraphSchema turns our SDL + resolvers into a federation-ready schema: it reads the
// @key/@link directives and adds the _entities query the router calls to resolve Show by id.
// The cast bridges codegen's Resolvers<Context> to @apollo/subgraph's resolver-map type — the
// two describe the same shape, but the libraries don't share a structural type.
const server = new ApolloServer<Context>({
  schema: buildSubgraphSchema({
    typeDefs,
    resolvers: resolvers as GraphQLResolverMap<unknown>,
  }),
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4001 }, // catalog subgraph → 4001 (reviews will be 4002, router 4000)
  // `context` runs ONCE PER REQUEST → fresh DataLoaders each time (see context.ts).
  context: async () => createContext(),
});

console.log(`🎬 catalog-service ready at ${url}`);
console.log(`   Open that URL in a browser for the Apollo Sandbox playground.`);
