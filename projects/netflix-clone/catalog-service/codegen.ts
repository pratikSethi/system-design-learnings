// GraphQL Code Generator config.
//
// Reads the SDL schema and generates TypeScript types for resolvers, so the
// resolver map is type-checked AGAINST the schema — no more hand-written
// `args: { id: string }` that can silently drift from the .graphql file.
//
// Run once:   npm run codegen
// Watch mode: npm run codegen:watch
//
// Output goes to src/generated/graphql.ts (git-ignored — it's a build artifact,
// regenerated from the schema).

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  // Where the schema lives. Glob so future *.graphql files are picked up too.
  schema: "./src/schema/*.graphql",

  generates: {
    "./src/generated/graphql.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        // Use TS `type` unions for enums (so ShowKind = 'MOVIE' | 'SERIES'),
        // matching our data layer rather than generating a separate enum object.
        enumsAsTypes: true,

        // Emit `import type { ... }` for type-only imports. Required because our
        // tsconfig has `verbatimModuleSyntax` on, which forbids importing a type
        // via a regular `import`.
        useTypeImports: true,

        // MAPPERS — the key concept. By default codegen assumes a resolver for
        // `Show` returns an object shaped exactly like the SDL `Show`. But at
        // runtime our data layer returns its own `Show` interface. Mappers tell
        // codegen "the runtime model for the `Show` type is THIS TS type," so
        // resolver return types line up with what the data layer actually yields.
        mappers: {
          Show: "../data/shows.js#Show",
        },
        // The mapper is imported under an aliased name (Show -> ShowMapper) so it
        // can't collide with the generated schema type also called `Show`.
        mapperTypeSuffix: "Mapper",
      },
    },
  },
};

export default config;
