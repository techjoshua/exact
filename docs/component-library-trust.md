# Component-library server trust

Published eXact component libraries can contribute ordinary component code to client and server
artifacts. Client-only code follows the application's normal browser dependency policy. Before a
component package can enter an artifact that executes on the server, the active build adapter
authorizes its resolved physical package instance.

This is supply-chain authorization for in-process JavaScript. It is not a sandbox. Authorizing a
library means trusting its implementation closure with the same server-process authority as other
application dependencies.

Application-local modules in the application package remain application-owned across Vite, Bun,
and Webpack. Importing a local component does not require the component-library marker or a
third-party authorization entry. This classification uses the shared physical-package policy.

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
and continuations always fail when unauthorized. Concurrent resolutions await the same pending
authorization decision before loading provider code. Cyclic component graphs terminate without
treating an in-flight decision as permission to execute.

## Library participation

A component library declares the inert marker in production dependencies and points to generated
static compiler facts:

```json
{
	"dependencies": {
		"@exactjs/component-library": "^0.6.0"
	},
	"exactComponentLibrary": {
		"protocol": 1,
		"build": "./dist/exact-component-build.json"
	}
}
```

`@exactjs/component-library` has no JavaScript entry, install script, registration, lifecycle, or
trust grant. The build-facts JSON maps package exports to compiler-owned component identities and
is validated without importing candidate code. Official component-library builds publish it only
after both compiler-generated client and server module trees succeed. Each export record
distinguishes the resolver-selected facade from the target-local implementation module that owns
the component's relative dependency edges. The root workspace build compiles every declared
package, so a clean release cannot depend on reflective scanning or an earlier package-local build.
Library authors should use the supported builder below. Custom artifact producers can still use
`@exactjs/compiler/component-library-build` to write the same deterministic metadata without
adopting the complete library pipeline.

### Build a component or enhancement library

Install `@exactjs/compiler` as a development dependency and keep the participation marker and
required runtime packages in production dependencies. Use the same builder for components and
enhancement providers:

```json
{
	"name": "@acme/controls",
	"version": "1.0.0",
	"type": "module",
	"files": ["dist"],
	"scripts": { "build": "exactc build-library" },
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"browser": "./dist/client/index.js",
			"default": "./dist/server/index.js"
		}
	},
	"exactCompiledComponents": ["Button"],
	"exactComponentLibrary": {
		"protocol": 1,
		"build": "./dist/exact-component-build.json"
	},
	"dependencies": {
		"@exactjs/component-library": "^0.6.0",
		"@exactjs/core": "^0.6.0",
		"@exactjs/dom": "^0.6.0"
	},
	"devDependencies": {
		"@exactjs/compiler": "^0.6.6",
		"@exactjs/jsx": "^0.6.0"
	}
}
```

Put source modules in `src/` and provide a `tsconfig.json`, for example:

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"jsx": "react-jsx",
		"jsxImportSource": "@exactjs/jsx",
		"strict": true,
		"skipLibCheck": true,
		"rootDir": "src",
		"outDir": "dist"
	},
	"include": ["src"]
}
```

The command owns `dist/`: it emits TypeScript declarations, compiles unbundled ES2022 ESM client
and server trees, copies compiler-generated optional-enhancement facades, checks exported component
identities and generated runtime dependencies, and writes the build facts. It does not bundle runtime
dependencies into the library. Declare generated runtime imports in `dependencies`,
`peerDependencies`, or `optionalDependencies`; missing declarations fail the build.
TypeScript declaration generation uses the builder's declared TypeScript dependency, independently of
an editor's TypeScript version. Source must be valid for declaration emission with that API;
application-only compiler syntax that raw TypeScript cannot check needs a separately prepared
declaration pipeline. Configured declaration maps are preserved and rebased in target directories.
The default build emits only declarations at the output root; executable modules belong to the
client and server trees. The builder does not generate JavaScript maps for lowered modules and
removes pre-emitted maps when replacing their JavaScript. Selective builds using `exactCompileModules`
retain TypeScript support modules and their maps for sources outside that list.

Use `--root directory` to select a package and `--project tsconfig.types.json` for a separate
TypeScript configuration. Its output and declaration directories must remain inside `dist/`, outside the client and server
target directories. Emitted paths must also avoid those directories: for example, `src/server/`
requires renamed targets via `exactTargetDirectories` when declarations go directly into `dist/`.
Project references must already be built. A pipeline that already emits TypeScript output can use
`--skip-declarations`; that mode retains root output and replaces only the target trees and facts.
Both modes restore the previous output after a failed build. Do not read the output while a build
is running. Concurrent builds of the same package are rejected. After forcibly terminating a
build process, inspect any `.exact-library-build-*` backup before removing its stale lock.

By default all production `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, and `.mjs` source modules under
`src/` are compiled. NodeNext `.mts` and `.mjs` modules retain `.mjs` output extensions,
including package entry points. Point their paired exports at the emitted `.mjs` files.
CommonJS `.cts` and `.cjs` compilation is unsupported and rejected before output is replaced.
Declarations, `.test` files, `test-support`, and `__tests__` are excluded. A package `files` exclusion
for `.fixtures.` also excludes fixture modules. Use `exactCompileModules` for an explicit array of
package-relative source paths. Use `exactTargetDirectories` to rename the `client` and `server`
output directories. These directories must be distinct immediate children of `dist/`.

For subpath exports, use an object such as
`"exactCompiledComponents": { ".": ["Button"], "./enhancements": ["tone"] }`.
Each listed export must identify an executable compiled component in both targets, including
re-exports through an entry facade. Server-only boundaries are not client implementations.
The builder verifies exports by executing author-owned modules in a fresh Node process;
keep module initialization suitable for build-time inspection. This is separate from the consumer
policy check, which reads static facts without executing unauthorized providers.

Enhancement capability declarations and ordinary package exports remain author-owned. Keep optional
enhancement imports in their compiler-supported form; the builder retains consumer-side provider
selection and no-op behavior. Static assets can remain outside `dist/` and be listed in `files`;
run custom asset generation after the build when needed. No watch mode is included.

Custom pipelines can call the same implementation:

```ts
import { buildLibrary } from '@exactjs/compiler/library-build';

await buildLibrary({ root: packageDirectory, project: 'tsconfig.types.json' });
// Or, after a pipeline has already emitted TypeScript output:
await buildLibrary({ root: packageDirectory, declarations: false });
```

## Enforcement and artifacts

The compiler emits target-neutral `componentBuild` facts and never reads policy or marker
metadata. Vite/Rollup, Webpack, Bun, Vitest, and Jest join those facts to their resolved package
graph and run the shared `@exactjs/component-library-policy` engine before candidate evaluation.
Policy denials (`not-allowed` and `explicitly-denied`) are warnings during bundling. The build
substitutes a throwing execution guard for the denied component edge, so starting or loading that
part of the app fails before the candidate or its transitive dependencies evaluate. A denied
transitive edge guards the enclosing packaged component as well. The denied implementation is not
included through that edge. Rebuild after correcting policy. Malformed participation metadata and
unresolved provenance remain build errors. Development loaders and server-side tests reject at their
pre-evaluation gate. This is framework component authorization, not a sandbox for arbitrary imports.
The same policy is used for development generations and server-side tests. Bun server `--hot` is
rejected because it cannot yet preserve a last-known-good authorization generation; use Bun watch
builds instead.

Authorizing a precompiled package also promotes its validated static build facts into the active
component graph. The adapter recursively resolves and authorizes packaged component and enhancement
imports before runtime, including imports hidden behind a server-externalized parent package.
Vite keeps authorized compiled component entries in the server bundle so their physical optional
enhancement facades pass through consumer resolution. Default npm externalization must not bypass
that selection or leave Node importing an absent optional provider. Ordinary dependency imports
remain subject to the application's bundler configuration.
Development generations retain only the last committed candidate set and revalidate that complete
set when source, policy, package manifests, lockfiles, or published build facts change. A rejected
generation leaves the prior graph active and can recover after the input is corrected.

The shared policy validates participation metadata once per resolved package instance in each
generation. Build integrations can sample value-free entry counts with `session.getTelemetry()`;
commit, rejection, and disposal clear every generation-owned cache. Pending authorization rejects as stale after any of those transitions; it cannot repopulate the released generation. This supports latency and heap
benchmarks without placing provenance telemetry in runtime artifacts.

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

Build the server artifact first, then project the emitted private manifest for any paired output:

```ts
import { readExactComponentAuthorizationIdentity } from '@exactjs/component-library-policy';
import { exact } from '@exactjs/vite-plugin';

const componentAuthorization = await readExactComponentAuthorizationIdentity(
	'dist/server/.exact/component-library-authorization.json'
);

export default {
	plugins: [exact({ componentAuthorization })]
};
```

Pass the same identity to SSR hydration options and retained server build registration. The Vite
option forwards it into server-executing microfrontend exposure metadata; it never forwards the
full manifest or audit.

When using `createExactServerRuntime()`, supply that identity as the flat
`componentAuthorization` option. The runtime forwards it to both server dispatch and every
hydratable rendering mode (string, async string, streaming, and progressive), preventing a render
entry point from silently omitting the authorization handshake.

Framework-plugin discovery remains independent. A package can separately be a component library
and a framework plugin, but authorizing either role never authorizes the other.
