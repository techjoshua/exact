# Component-library server trust

Published eXact component libraries can contribute ordinary component code to client and server
artifacts. Client-only code follows the application's normal browser dependency policy. Before a
component package can enter an artifact that executes on the server, the active build adapter
authorizes its resolved physical package instance.

This is supply-chain authorization for in-process JavaScript. It is not a sandbox. Authorizing a
library means trusting its implementation closure with the same server-process authority as other
application dependencies.

## Application policy

Configure the policy once in `exact.config.*`:

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	componentLibraries: {
		mode: 'trusted',
		allow: ['@acme/maps', { package: '@vendor/charts', version: '^2.4.0' }],
		deny: ['@unreviewed/'],
		trustedScopes: ['@company/'],
		unauthorizedOptionalEnhancements: 'error'
	}
});
```

`trusted` is the default. It authorizes compatible direct production dependencies, explicitly
allowed packages and scopes, the default `@exactjs/` scope, and compatible production component
dependencies delegated by an already authorized component library. `root` limits implicit trust
to direct application dependencies. `all` admits every compatible package reached through the
server component graph. A matching `deny` always wins.

Rules select resolved package instances. Object rules can constrain a package with a semver range
and an exact lockfile integrity value. `optionalDependencies` and peer dependencies do not inherit
trust. Set `includeDefaultTrustedScopes: false` to remove the built-in `@exactjs/` scope.

An unauthorized optional enhancement fails by default. `unauthorizedOptionalEnhancements:
'exclude'` leaves only that optional implementation inactive. Required components, task owners,
and continuations always fail when unauthorized.

## Library participation

A component library declares the inert marker in production dependencies and points to generated
static compiler facts:

```json
{
	"dependencies": {
		"@exactjs/component-library": "^0.1.0"
	},
	"exactComponentLibrary": {
		"protocol": 1,
		"build": "./dist/exact-component-build.json"
	}
}
```

`@exactjs/component-library` has no JavaScript entry, install script, registration, lifecycle, or
trust grant. The build-facts JSON maps package exports to compiler-owned component identities and
is validated without importing candidate code. Official component-library builds generate it
after TypeScript output. Custom package tooling can use
`@exactjs/compiler/component-library-build` to create and write the same deterministic protocol.

## Enforcement and artifacts

The compiler emits target-neutral `componentBuild` facts and never reads policy or marker
metadata. Vite/Rollup, Webpack, Bun, Vitest, and Jest join those facts to their resolved package
graph and run the shared `@exactjs/component-library-policy` engine before candidate evaluation.
The same policy is used for development generations and server-side tests. Bun server `--hot` is
rejected because it cannot yet preserve a last-known-good authorization generation; use Bun watch
builds instead.

Authorizing a precompiled package also promotes its validated static build facts into the active
component graph. The adapter recursively resolves and authorizes packaged component and enhancement
imports before runtime, including imports hidden behind a server-externalized parent package.
Development generations retain only the last committed candidate set and revalidate that complete
set when source, policy, package manifests, lockfiles, or published build facts change. A rejected
generation leaves the prior graph active and can recover after the input is corrected.

Each successful server build writes private files under `.exact/`:

- `component-library-authorization.json` contains the deterministic policy hash, package-instance
  decisions, server execution reasons, omitted enhancements, and authorization fingerprint.
- `component-library-audit.json` contains redacted dependency provenance and matched rules for
  review and DevTools projection.

The audit excludes absolute package paths, raw integrity values, source text, and unrelated
dependencies. Client output must never expose the full policy or audit graph.

When server inspection catalogs are enabled, the matching build catalog includes this redacted
audit for authorized DevTools inspection. It remains server-owned and is never emitted into client
code.

Paired SSR, hydration, and retained remote artifacts exchange only the compact `{ protocol,
buildKey, fingerprint }` identity projected from the manifest. Hydration rejects a mismatched
client/server identity, and server operations carrying a stale fingerprint follow the existing
unsupported-build recovery path.

Framework-plugin discovery remains independent. A package can separately be a component library
and a framework plugin, but authorizing either role never authorizes the other.
