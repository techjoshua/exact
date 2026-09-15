# Application scaffolding

`@exactjs/create-exact-app` owns project configuration and installation. Run it through
`npm create @exactjs/exact-app@latest my-app`. For automation, use
`npm create --yes @exactjs/exact-app@latest my-app -- --yes`; npm and the scaffolder each
have their own prompt controls. Add `--no-install` after the separator to defer installation.

The corrected standalone flow requires scaffolder, compiler, and testing 0.5.1 or later.
The 0.5.0 compiler tarball omitted transitive JavaScript host modules; fixing the scaffold
alone cannot repair that distribution. Compatible runtime ranges remain unchanged.

## Generated application contract

- Vite, Webpack, and Bun build a browser application with an HTML entry and linked CSS.
- Vite uses `vitest/config` when its configuration includes Vitest options. Webpack resolves
  authored `.js` imports to TypeScript sources and uses HtmlWebpackPlugin for the HTML output.
- Bun builds release the compiler in `finally`. Development serializes builds, keeps the last
  successful assets after errors, and serves only generated assets. Refresh after an edit.
- Component tests use the selected runner. Bun tests select browser exports explicitly;
  Vitest and imported Jest `expect` both receive eXact matcher declarations.
- `exactc --check .` checks the application, configuration, and scripts. CSS imports have a
  local declaration; generated server code declares its direct `@exactjs/server` dependency.
- Server adapters are transport endpoint examples. Applications must connect their compiler
  contracts, SSR page rendering, static assets, and hosting configuration before deployment.

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
