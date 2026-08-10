// GraphQL Code Generator config for the reviews subgraph (mirrors catalog-service).
// Generates typed resolvers from the SDL. federation: true makes it understand @key/@link.

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./src/schema/*.graphql",

  generates: {
    "./src/generated/graphql.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        federation: true,
        enumsAsTypes: true,
        useTypeImports: true,
        // Review resolvers run over our data-layer Review. Show is a federation reference
        // here (reviews doesn't own it), so it maps to just the key we get: { id }.
        mappers: {
          Review: "../data/reviews.js#Review",
          Show: "{ id: string }",
        },
        mapperTypeSuffix: "Mapper",
      },
    },
  },
};

export default config;
