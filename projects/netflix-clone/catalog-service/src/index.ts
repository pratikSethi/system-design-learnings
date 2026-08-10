// SERVER ENTRYPOINT — wires the schema + resolvers together and starts Apollo Server.
//
// The flow:
//   1. Read the SDL (.graphql) file  → the type definitions ("typeDefs").
//   2. Import the resolver map        → the functions behind each field.
//   3. Hand both to ApolloServer      → it builds an executable schema.
//   4. startStandaloneServer          → an HTTP server that also serves Apollo Sandbox,
//      the in-browser playground where you can browse the schema and run queries.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";

import { resolvers } from "./resolvers/index.js";
import { type Context, createContext } from "./context.js";

// Resolve the schema path relative to THIS file (works regardless of cwd).
const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(join(__dirname, "schema/shows.graphql"), "utf-8");

// Type the server with our Context so resolvers get a typed 3rd argument.
const server = new ApolloServer<Context>({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: 4001 }, // catalog subgraph → 4001 (reviews will be 4002, router 4000)
  // `context` runs ONCE PER REQUEST → fresh DataLoaders each time (see context.ts).
  context: async () => createContext(),
});

console.log(`🎬 catalog-service ready at ${url}`);
console.log(`   Open that URL in a browser for the Apollo Sandbox playground.`);
