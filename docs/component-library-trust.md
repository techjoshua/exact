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
An application package does not need a published name or version for its own components.
External packages still require both fields, including packages nested inside the application directory.

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
		"@exactjs/component-library": "^0.7.0"
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
adopting the complete library pipeline. The writer validates package-relative paths and export
ownership. It refuses linked destination files or directories before creating output, and accepts
ordinary filenames beginning with `..` when they remain inside the package. Both publication and
consumption reject Windows drive-relative paths such as `C:outside.js`, even on a POSIX build host. Consumers validate
static facts again before generating imports, including registration owners and duplicate selections.

### Build a component or enhancement library

Install `@exactjs/compiler` as a development dependency and keep the participation marker in
production dependencies. Declare framework runtimes as compatible peers when the library should
share the consumer's runtime instances. Install those peers as development dependencies for the
library's own build and tests. The builder accepts dependencies, optional dependencies, and peers
for emitted runtime imports and reports missing packages across both targets in one error.
Interactive library owners can emit SSR publication imports even when the authored source has no
SSR import. Declare `@exactjs/ssr` as a compatible runtime peer when the builder reports that need.
Peers do not inherit delegated authorization, so the consumer must authorize them through its
own dependencies, allow rules, or trusted scopes. Use the same builder for components and
enhancement providers. Compiler-owned JSX fragments and structural tags, such as
`_`, `Fragment`, and `Activity`, describe rendering operations and do not create foreign component
authorization edges. Imported components with the same names from other packages still require
normal library participation and authorization.

The Vite, Bun, and Webpack adapters resolve installed `@exactjs/` packages through the
application's instance when that package is available to the application. This keeps component
state, contexts, and enhancement registration in one coordinated runtime even when a linked
library contains another physical copy. Export conditions and explicit bundler aliases still
select the target implementation. An optional provider installed only by the library remains
available through that library. Resolution does not grant server authorization, and the
application's deny and optional-exclusion rules still apply.

The library builder also publishes paired registration products for its components. A consuming
compiler artifact graph follows reached library components, their nested component imports, and
enhancement-provider imports,
then includes their client islands, server parts, continuation plans, and boundaries. Public export
aliases retain the owning component identity. Private compiled modules remain compiler-selected
implementation details. Planning reads static metadata without evaluating the library.
Rebuild libraries with compiler 0.7.1 and regenerate the consumer's hydration registration to use
this automatic composition. Older protocol-1 facts remain accepted but contain no registration
products. Applications still choose whole-root hydration or an island client for their root's
placement, and still compose their server executor contract for transported work.

A library manifest can select browser and server outputs independently:

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
		"@exactjs/component-library": "^0.7.0",
		"@exactjs/core": "^0.7.0",
		"@exactjs/dom": "^0.7.0"
	},
	"devDependencies": {
		"@exactjs/compiler": "^0.7.0",
		"@exactjs/jsx": "^0.7.0"
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
declaration pipeline. Configured declaration maps are preserved. A separate declaration-only
directory, such as `dist/types`, stays shared instead of being copied into both target trees.
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
Both modes build in private staging and publish verified output. The previous generation stays
readable during compilation and is retained after a failed build. Publication replaces the output
directory, so consumers should reload after the completed generation. Concurrent builds of the same package are rejected. After forcibly terminating a
build process, inspect any `.exact/library-build-*` backup before removing the stale
`.exact/library-build.lock`. Staging and rollback files stay inside the package's `.exact/` cache.

By default the selected TypeScript project's source roots under `src/` are compiled, respecting
its `include`, `exclude`, `files`, and inherited configuration. JavaScript roots require `allowJs`.
Imported production sources are compiled too. TypeScript's `exclude` removes project roots,
so an excluded module imported by a selected source still belongs to the build. Test, spec, Jest
and test-support modules remain unpublished. A production import of one fails before output
is replaced. Move a shared production helper into a published source module.
Each compiled component also needs a proven placement. An opaque helper that leaves placement
unresolved fails the build before replacement. Verify the helper and supply its execution contract
instead of publishing component facts that a consumer cannot authorize.
NodeNext `.mts` and `.mjs` modules retain `.mjs` output extensions,
including package entry points. Point their paired exports at the emitted `.mjs` files.
CommonJS `.cts` and `.cjs` compilation is unsupported and rejected before output is replaced.
Declarations, `.test`, `.spec`, and `.jest` files, `test-support`, and `__tests__` are excluded. A package `files` exclusion
for `.fixtures.` also excludes fixture modules. Use `exactCompileModules` for an explicit array of
package-relative source paths. Use `exactTargetDirectories` to rename the `client` and `server`
output directories. These directories must be distinct immediate children of `dist/`.

For subpath exports, use an object such as
`"exactCompiledComponents": { ".": ["Button"], "./enhancements": ["tone"] }`.
Each listed export must identify an executable compiled component in both targets, including
re-exports through an entry facade. Server-only boundaries are not client implementations.
The builder verifies exports by executing author-owned modules in a fresh Node process.
When calling the library-build API from Bun, keep Node available on `PATH`.
Keep module initialization suitable for build-time inspection. Package self-imports and private
imports into `dist/` resolve against the candidate output, including on the first build.
Client checks select `browser` exports, while server checks use Node's default conditions.
A missing candidate module cannot fall back to the previous generation. This is separate from the consumer
policy check, which reads static facts without executing unauthorized providers.

Enhancement capability declarations and ordinary package exports remain author-owned. Keep optional
enhancement imports in their compiler-supported form; the builder retains consumer-side provider
selection and no-op behavior. Static assets can remain outside `dist/` and be listed in `files`;
run custom asset generation after the build when needed.

Generated component and operation identities are opaque. Current compilation includes the physical
source location in identity and enhancement-facade generation, so identical sources built in another
checkout are not guaranteed to produce byte-identical JavaScript. Moving a completed library package
does not regenerate its identities. Publish the client modules, server modules, and build facts from
one successful generation together. For byte-level release verification, retain and compare the
actual release tarball rather than expecting a fresh build at another path to match it.

For local library development, run `exactc build-library --watch` alongside the consuming dev server.
Source edits, added or removed source modules, package/config changes, and inherited tsconfig edits
rebuild the paired artifacts. Imported JSON changes also trigger rebuilding. CSS and other assets
remain owned by the library's separate asset pipeline and do not trigger component compilation.
Builds run serially. Invalid edits report an error and retain the
last successful output, then recover when the source is corrected. Stop the command with Ctrl+C
so its active build finishes and its watchers close. The consumer should watch the published
library files or restart after a successful build if its bundler caches linked dependencies.
Wait for the initial successful library build before starting consumer SSR. If your server imports
separately generated application artifacts, regenerate those artifacts after library publication
and before reloading the SSR module graph. This keeps requests within a completed generation.

For a library stylesheet, publish an ordinary package subpath alongside the paired component
exports. Keep the CSS in an author-owned directory so replacing `dist/` does not remove it:

```json
{
	"files": ["dist", "styles"],
	"exports": {
		"./styles.css": "./styles/library.css"
	},
	"sideEffects": ["**/*.css"]
}
```

A consumer's browser entry can import `@your-scope/kit/styles.css`. Its build adapter handles the
CSS import and publishes the stylesheet through the application's normal asset route. This also
works in a TSX entry containing ordinary JSX helpers. Stylesheet imports are declared client
assets, so server compilation omits their execution while bundlers can retain them for asset
delivery. Other executable package imports still require a known placement contract. For a
prebuilt stylesheet hosted independently, link it from the document shell instead. `build-library`
compiles components and declarations and does not bundle CSS or create an HTTP stylesheet route.

When a consumer compiles package source, package-scoped enhancement namespaces come from the
source package's own `exact.config.*`. Those declarations are read statically. The consumer's
configuration still owns execution authorization, optional provider selection, and application
plugins. Configuration declarations do not authorize an otherwise unsupported library artifact.

The builder checks your sources with eXact's typing rules before emitting declarations from their
authored signatures. Function-defined tasks can access their component state in a library just as
they can in an application. Invalid state assignments and ordinary TypeScript errors still fail
the build.

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
Relative component imports within a package are matched to their implementation modules using
published canonical component identities. This includes eager and lazy registry entries and
private children behind a public export facade. Missing or inconsistent identity facts fail
authorization and require rebuilding the library. Cross-package imports still require public
export mappings and resolver-proven package participation.
Vite keeps authorized compiled component entries in the server bundle so their physical optional
enhancement facades pass through consumer resolution. Default npm externalization must not bypass
that selection or leave Node importing an absent optional provider. Ordinary dependency imports
remain subject to the application's bundler configuration.
Development generations retain validated consumer import roots, including initial module loads
before the first hot update. Each replacement reauthorizes those roots under current policy and
reads their current published component and enhancement imports. Internal library imports follow
their consumer roots, including when Vite reloads a child while its consumer stays cached. Removed
published imports are discarded. Published module ownership survives invalidation so source
transforms cannot replace library provenance before the current metadata is reloaded. A rejected generation leaves the prior graph active and can
recover after the input is corrected. Vite serializes hot-update transactions and rechecks
in-flight resolutions if their authorization generation changes. Current-policy denials and final
server disposal remain failures. Vite keeps declared participating libraries and their declared
library dependencies in its SSR module graph automatically, so installed libraries do not need
an application-authored `ssr.noExternal` list. In browser development, the adapter also keeps
participating libraries and their framework runtimes outside dependency optimization. This
preserves renderer activation imports and one shared runtime instance for provider hydration.
Discovery does not grant execution authority.
Development SSR shares one enhancement catalog per application
and target across overlapping module loads, so a retained renderer can resolve newly loaded
component enhancements. Provider replacements follow module evaluation order. Conflicting
registrations within one evaluation remain errors, and production catalog rules are unchanged.

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
