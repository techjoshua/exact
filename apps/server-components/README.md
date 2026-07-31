# eXact server components sample

A focused example of compiler-distributed component work without tying the runtime to a specific
web server or bundler.

## Generate and test

```sh
npm run generate -w @exactjs/sample-server-components
npm run test:server-components
```

The sample demonstrates a browser-owned durable component whose server tasks execute through
compiler-generated, allowlisted operations. It includes hydratable initial rendering, private
server context, explicitly shared plain data, and reconstructed public context in the browser.

Start with `src/ProfilePage.tsx` for component source and `src/server.ts` for server runtime
composition. Generated artifacts are written under `.exact`.
