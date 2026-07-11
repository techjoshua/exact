# eXact Server Components Sample

This sample shows the server-component wiring path without tying it to Express, Hapi, Vite, Webpack, or Bun.

The component source lives in `src/ProfilePage.tsx`. A build can emit split artifacts with:

```sh
npx exactc --rootDir apps/server-components/src --outDir apps/server-components/.exact --artifacts --serverComponents apps/server-components/src
```

`src/server.ts` demonstrates the runtime shape:

- create a secure server manifest from compiler manifest data
- derive hydration config from that manifest
- register manifest-scoped action and boundary handlers with `createExactServerHandlerRegistry`
- dispatch requests through `handleExactRequest`

The registry accepts app-provided functions, but it only exposes IDs already present in the manifest.
