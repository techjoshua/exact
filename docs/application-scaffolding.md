# Application scaffolding

`@exactjs/create-exact-app` owns project configuration and installation. Run it through
`npm create @exactjs/exact-app@latest my-app`. For automation, use
`npm create --yes @exactjs/exact-app@latest my-app -- --yes`; npm and the scaffolder each
have their own prompt controls. Add `--no-install` after the separator to defer installation.

The SSR and single-file starters target the unpublished 0.6.0 package family.
Use matching candidate packages until that release is published.

## Generated application contract

- Vite, Webpack, and Bun build a browser application with an HTML entry and linked CSS.
- Vite uses `vitest/config` when its configuration includes Vitest options. Webpack resolves
  authored `.js` imports to TypeScript sources and uses HtmlWebpackPlugin for the HTML output.
- Bun builds release the compiler in `finally`. Development serializes builds, keeps the last
  successful assets after errors, and serves only generated assets. Refresh after an edit.
- Component tests use the selected runner. Bun tests select browser exports explicitly;
  Vitest and imported Jest `expect` both receive eXact matcher declarations.
- `exactc --check --project tsconfig.json` checks the application, configuration, and scripts
  selected by the generated tsconfig. CSS imports have a local declaration; generated server code declares its direct `@exactjs/server` dependency.
- A server runtime defaults to SSR plus hydration with Vite. The generated application includes
  a document shell, compiler-generated registration, `/__exact`, client assets, production host,
  owned development process, and a Node container example. `--operations-only` explicitly selects
  the transport-only scaffold. Webpack and Bun server scaffolds currently require that opt-out.
- `--output single-file --runtime browser --bundler vite` emits one browser-only HTML file.
  `exactSingleFile()` owns embedding in the build integration, not a generated postprocessing script.

## Server deployment

Run `npm run build`, then `npm start` for the Node host. Serve `dist/client` alongside the selected
host entry in `dist/server/server.js`. Local development uses the Node adapter even when another
runtime is selected. Fetch and serverless outputs export handlers for their deployment platform;
Cloudflare uses the generated ASSETS binding. Platform-specific environments still require their
own deployment/emulator validation. The included Dockerfile targets Node.

`src/application.tsx` composes `Document` through `documentShell(application)`. Public `hydrate()`
retains request dispatch and discovers sibling bootstrap data; `@exactjs/hydrate/root` is the explicit
hydration-only API. Generated registration closes the client graph without manual enhancement catalogs.
Source generation publishes `.exact` transactionally; do not delete the output directory while a
resolver or dev server is reading it. The full-stack starter regenerates after source edits and reloads.

For a sibling package exporting TypeScript, add only its package name to `ssr.noExternal` in the
server Vite config. Ordinary external dependencies can stay external. Native component libraries
must publish their paired artifact contract. The generated README includes the commands and example.

## Single-file delivery

Use `exactSingleFile()` from `@exactjs/vite-plugin` in place of `exact()`. The build requires one
HTML entry, embeds compiled JavaScript, CSS, imported images and fonts, and folds dynamic imports.
Asset references must resolve through Vite; public-directory URLs, remote CSS/module dependencies,
unresolved assets, `srcset`, and separate worker files produce diagnostics. Inline workers supported
by Vite may remain inside the script. Server components and server tasks are rejected.

The baseline works offline through a `file:` URL. Use hash navigation. Browser secure-context APIs,
storage, permissions, and service workers retain their normal file-origin restrictions. Application
network features remain explicit opt-ins; the framework baseline requires no requests.

## Release validation

Test the npm tarballs in a directory outside the monorepo. Workspace resolution and existing
outputs can hide missing files or undeclared dependencies. During prerelease validation, install
candidate tarballs for changed packages in the generated app; retain published compatible
dependencies for everything else. Never publish merely to make a smoke test installable.

The representative matrix covers Vite/browser/Vitest with the agent skill, Webpack/Hapi/Jest
with React 19 compatibility, and Bun/Bun/Bun tests. Check installation, type checking, tests,
production builds, and browser interaction with the built output. Template tests materialize
every advertised runtime option, but that is not an end-to-end deployment test for each host.

`check:publish` executes compiler CLI help using only npm-selected files, catching missing
transitive host modules before publication. Preserve the frozen released ABI fixtures.
Changes to the compiler package selection or templates must repeat the standalone checks;
a successful workspace build alone does not establish installability.

## SSR testing repair

The published 0.5.0 testing helper listened for durable-instance callbacks that direct SSR does
not emit. Testing 0.5.1 consumes direct frame snapshots instead and requires SSR 0.5.1. When a
direct observer is present, SSR retains every logical parent, including stateless intermediate
components. Ordinary renders keep their compiler-selected frames and stateless fast path.

The capture assigns per-render identities, preserves construction order, snapshots settled state,
props and contexts before teardown, and rolls back abandoned descendant observations. It does
not recreate a durable component runtime or rerun component definitions. Native client tests that
exercise reactive updates now use compiled TSX fixtures instead of raw functions with a synthetic
brand. Server fixtures are compiled for the server target, preserving target validation.

The same validation found that an empty compiler resumption capture dropped explicitly supplied
activations from the hydration script. That case now takes the existing named-to-compact serializer;
compiler-owned positional payloads keep their fast path and released wire format.

Regression coverage includes scheduled server state, all context scopes, stateless roots and
intermediates, repeated component identity, creation order, teardown on success and failure, and
public activation values in the emitted hydration script. No compiler ABI epoch change is required.

`npm run test:created-apps` builds fresh projects outside the repository against local unpublished
package links. It checks production and development SSR, document head, hydration, continuation
requests, a sibling TypeScript source package, and an offline browser opening the single HTML file.
It also exercises production SSR and continuations through Express, Fastify, Koa, and Hapi.
Fresh Vitest execution and execution after artifact regeneration are covered; generation preserves
the published output until replacement artifacts are ready.
This supplements tarball installation checks; links do not prove npm publication completeness.
