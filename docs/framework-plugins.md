# Framework plugins

The application configuration has one runtime normalization boundary. `defineConfig()` and the
Node configuration loader validate the same built-in schema before plugin discovery or adapter
projection. Authored values, executable callbacks, and loader observations remain ordinary
JavaScript objects with TypeScript readonly declarations. Validation preserves callback identity
and leaves callback-owned state and metadata untouched. Unknown built-in keys and invalid mode-specific fields fail at the
configuration file instead of being interpreted differently by separate consumers. Plugin-owned
configuration remains extensible through the registered `plugins` keys, whose values must be a
configuration transform or `false`.

Configuration discovery stays within its selected workspace boundary. Public plugin entries stay
inside their selected physical package and must be exported. Ordinary names beginning with `..`,
such as `..generated`, remain valid child names. Only a complete `..` path segment traverses to
a parent directory. Component-library facts and published translation data use the same containment
rule.

Status: implemented.

eXact framework plugins add cross-cutting behavior to build, server, rendering,
client, and testing hosts through one validated package protocol. The compiler
is deliberately outside that registry: it always emits portable source-derived
metadata, while the final application build decides which package capabilities
to include.
The implementation is divided between:

- `@exactjs/plugin-api`, which owns browser-safe public contracts and package
  participation helpers;
- `@exactjs/config`, which owns `exact.config.ts` loading and typed
  configuration;
- `@exactjs/plugin-host`, which owns Node-side discovery, trust, version
  selection, graph ordering, projections, lifecycle, and cleanup; and
- host adapters, which consume prepared application projections without
  reimplementing discovery.

`@exactjs/secrets` and `@exactjs/microfrontends` exercise the protocol as
official plugins.

## Discovery and trust

The host supports `root`, `trusted`, and `all` discovery modes. Omitting `pluginDiscovery`
uses `trusted` mode and initially trusts packages in the `@exactjs/` scope. Supplying a discovery
object without `mode` currently selects `root`. Set the mode explicitly when changing discovery
options. Package
ignores, required dependencies, supported host capabilities, and version
ranges are validated before plugin code participates.

Trusted plugin code executes in-process. Discovery is a supply-chain policy,
not a JavaScript sandbox. Applications should not trust a plugin package they
would not trust as build or server code.

Only one implementation of a canonical plugin may execute. When several
dependency branches expose candidates, the host selects a deterministic
compatible version or fails with provenance explaining the conflict.

## Component transformation

Build adapters use eXact to compile component definitions. For supported scalar helper calls in
component tasks, generated caller code supplies state access while retaining the helper's ordinary
import and function identity. The host tool handles ordinary JavaScript and TypeScript syntax.
An explicit `include` admits a file for consideration; it does not authorize cloning its helpers.

Selected helper sources, checked declarations and supported JSDoc placement and secrecy metadata
remain available to component analysis. An annotation does not authorize helper rewriting.
Individually admitted sibling files retain the host resolver's selected module identity.

Ordinary `.tsx` helpers outside selected component definitions retain their JSX for the host.
Native-selected Webpack output carries its automatic `@exactjs/jsx` selection through the async
loader handoff. React-owned and ordinary-host fallback output retain their existing policy.
The host entries accept only an already-compiled component with a current matching target artifact;
public SSR and DOM providers retain their normal admission checks. No intrinsic or general JSX
runtime is supplied. `.jsx` helper lowering and ordinary callables within a selected component span
remain unmigrated. This bounded path does not establish general helper-body preservation.

## Configuration

`exact.config.ts` is the canonical application configuration. Plugins augment
its TypeScript shape and can contribute defaults or transformations through
the dependency graph. Ordinary JavaScript ESM configurations load in place, including from read-only directories.
Node keeps native query-based loading. Bun invalidates only the selected config through its
supported module cache, leaving imported dependencies cached. Relative imports and native
`import.meta` retain their authored module base. TypeScript and attributed enhancement declarations
reuse separate same-directory temporary modules for preprocessing, with cleanup on success or
failure. That preprocessing requires a writable directory. Explicit `.cjs` files retain their
existing runtime cache behavior.

Preparation has one parser/projection owner, backed by the exact runtime dependency
`@typescript/native` (`npm:typescript@7.0.2`). The official async API parses isolated source without
executing config code. TypeScript emit uses the selected tool's CLI with explicit options, no
application tsconfig inheritance and no semantic project checks. Snapshots, APIs, emit children
and temporary inputs are released before preparation completes. The dependency remains acyclic
because config depends directly on the official tool, not on `@exactjs/compiler`.

`loadExactPackageEnhancements()` retains its synchronous return for transformation and workspace
callers. It invokes one same-runtime preparation command, with Bun remaining Bun. That command
uses the same async extraction owner with emit disabled and returns only plain declarations or a
structured error. Config execution and callbacks stay in the parent. Command responses are bounded
to 8 MiB, with a separate 16 MiB parent capture bound. These are transport safety limits, not
analysis-cost policy. Ordinary async config loads call the preparation owner directly.

Use `.ts` or `.mts` for portable TypeScript ESM configs. Native `.cts` emit is CommonJS. The unchanged
ESM execution path rejects the measured `.cts` case on Node while Bun accepts it. No separate
CommonJS execution strategy or portable `.cts` support is implied.

Callback contexts, parsed participation metadata, discovery results, and transform reports retain
TypeScript readonly declarations and ordinary JavaScript values. Context provenance paths are
independent of the discovery graph used to select code and schedule contributors. Policy arrays
and forwarding choices are captured before validation, so the published values are the ones checked.

Configuration order is deterministic:

1. plugin defaults.
2. dependency leaves before their consumers.
3. alphabetic order within each ready batch.
4. the application root last.

A transform that returns `undefined` retains the current configuration. A
returned value replaces it. Configuration may be asynchronous. Final
validation runs after every transform and before any host output is accepted.

Server-only configuration is projected only into hosts that need it. It must
not appear in client projections, generated client code, hydration data,
diagnostics, logs, or profile attributes.

## Host projections and lifecycle

A prepared application registry can expose separate build, server, render,
client, and testing projections. Build projections configure bundling and may
be translated into ordinary compiler options, but the registry and plugin code
never enter compiler analysis or lowering. Build and language projections must contain JSON-safe
data. Shared sibling references are permitted and serialize as copies. Ancestor cycles remain
invalid. Hosts run the shared lifecycle contracts rather than
inventing plugin-specific hooks.

Application and request resources are disposed in reverse acquisition order.
Cancellation and cleanup belong to the host scope that created the resource. Failed initialization
rolls back every acquired resource. If rollback also fails, an `AggregateError` retains the
initialization error as its `cause` and first entry, followed by the cleanup failure group.
Successful rollback preserves the original thrown value.
Registry preparation rejects an already-aborted signal before loading configuration and checks
cancellation again after loading, before starting plugin preparation. Preparation has no automatic
deadline. Callers may supply `signal` or a positive `timeoutMs` in milliseconds. Cancellation
preserves the signal’s exact reason and fences runtime extension loading, validation and registry
publication. A foreign
promise can finish after cancellation, but the host does not start the next owned stage after it
settles. Configuration callbacks should observe their context signal while doing asynchronous work.
Build adapters invalidate prepared registries when configuration, plugin
manifests, or discovered package inputs change.

Output processing follows a strict boundary:

1. plugins may transform an output;
2. all final validators run;
3. validation failure prevents publication; and
4. no plugin may mutate the output after final validation.

Synchronous output boundaries require synchronous transforms and validators. A promise or
thenable result rejects publication immediately. The host observes its eventual rejection so
the invalid hook cannot also create an unhandled asynchronous failure. Asynchronous output
boundaries await these hooks normally.

## Authoring guidance

Use `@exactjs/plugin-api` for shared contracts and package participation. Use
`@exactjs/plugin-host/node` only in filesystem-backed hosts. Keep plugin
build data bounded and deterministic, declare capabilities and ordering
explicitly, and put host-specific behavior in the appropriate projection.

An application feature that can be expressed as a component, context, or
ordinary task should remain application code. A framework plugin is warranted
when the behavior must participate consistently in several build/runtime
hosts or enforce a cross-cutting boundary.

## Enhancements are not framework plugins

Namespaced JSX enhancements are optional ordinary components supplied by component libraries. The
compiler lowers each application once into a canonical enhancement render node. Its generated
provider import is always resolvable: Vite and Bun use generation-owned virtual facades, while
Webpack and native Node use physical ESM facades under `.exact/enhancements`. If the provider is not
installed or enabled, the facade selects a shared zero-instance pass-through and preserves the
authored target. An installed malformed, unauthorized, or evaluation-failing provider remains a
build error. Webpack checks Node-missing provider requests with its owning resolver so source
extensions and configured aliases can establish availability. Relative provider imports and their
portable descriptors retain the authored source origin when physical facades move into the output
cache. Finite package-scoped spreads retain the same provider catalog as explicit attributes.
Client facades also activate the versioned DOM enhancement capability, which keeps the
host implementation in the static or lazy graph of the component that needs it and out of
enhancement-free clients. This is not plugin discovery, configuration, host projection, or plugin
lifecycle.

The implemented [trusted language-service contribution](language-contribution-protocol.md)
role is independent again: a plugin or enhancement library may publish inert editor metadata or an
explicitly trusted analyzer without receiving compiler callbacks. Enabled provider errors join the
compilation validation gate but cannot transform output. Language-role trust and ignores do not
implicitly enable or disable plugin runtime participation.

See [Component language](component-language.md#enhancement-composition) for attributed imports,
finite activators, direct `_` composition, `_target`, bounded routing, SSR, and hydration.

Bun exposure builds request native build metadata and map its output paths relative to the
configured output directory. Source identities come from metadata, so custom hashed names and
ordinary `..name` child directories retain their published entry and resource URLs. Hashed exposure
names require the metafile support introduced in [Bun 1.3.6](https://bun.com/blog/bun-v1.3.6#metafile-in-bunbuild).

## Current limitations

- Bun producer builds are verified on 1.4.3. Bare bundler controls on Bun 1.3.0 and 1.3.6
  place entries outside the configured output directory when physical and virtual entrypoints
  are combined. Changing the supported producer minimum or virtual module identity needs a
  separate compatibility decision. No runtime version rejection is added.

- Webpack and Bun use the shared contracts but individual plugins may expose a
  narrower host-specific feature set. Check the plugin and runtime docs.
- Low-level enhanced-renderer callers may still supply an explicit catalog. Compiler and adapter
  output prepares the same provider decision before application execution; it is never resolved per
  request.

## Generated provider facades and adapter ownership

The shared build kernel owns optional-provider resolution and generation fencing across Vite,
Webpack, Bun, and native Node. Adapters materialize the same artifact-local plan.

### Portable generated facades

The compiler/build boundary uses a canonical generated-provider request. Its spelling is an
internal artifact detail; `exact:optional-enhancement/...` is illustrative. Each adapter resolves
the request before ordinary package resolution.

The portable representation is a generated physical module beneath the build-owned `.exact`
artifact directory. This allows native Node ESM and tools without a virtual-module facility to use
ordinary resolvable imports. Generated paths are never transport or component identity.

Adapters may optimize the same facade in memory:

- Vite/Rollup may implement it with `resolveId` and `load`;
- Bun may use a private `onResolve` namespace and `onLoad`;
- Webpack may redirect through resolver hooks to cache-aware generated modules; and
- Node SSR imports the physical ESM facade directly without a custom loader.

All mechanisms consume one prepared facade plan and must emit observably equivalent modules.

Facade reachability remains artifact-local. A page entry, eager component, lazy interaction island,
dynamic registry candidate, and server executor artifact each receive only the facades reachable
from that generated artifact. Preparing a provider used solely by a lazy artifact must not import
its implementation into the eager page graph or add it to a page-wide runtime registry. The lazy
artifact brings the facade contribution with its own chunk or physical generated-module closure.

Generated server and client facades may select different target exports while retaining one
logical provider identity. For example, a motion library may declare a server pass-through and a
real browser implementation. The prepared plan records the target behavior and verifies that the
pair preserves authored output, ownership, range, and hydration contracts.

If a package is discoverable for only one target and publishes no compatible fallback declaration,
the prepared plan selects the shared unavailable result or reports an incompatibility according to
the existing enhancement contract. It must not accidentally render a structural server wrapper
that the client cannot hydrate.

### Prepared facade plan

The tool-neutral build kernel:

1. joins compiler-emitted provider identity with the resolved package graph;
2. applies existing component-library authorization before server module evaluation;
3. resolves target exports under the appropriate browser, node, import, and framework conditions;
4. chooses real, declared pass-through, or shared pass-through implementations;
5. emits a deterministic paired facade plan;
6. supplies source-linked inclusion or omission explanations; and
7. owns invalidation and disposal with the compilation generation.

Vite, Webpack, and Bun adapters translate that plan into native lifecycle operations. They do not
reimplement optionality, trust, placement, or hydration policy independently.

Each plan entry records the generated artifact and build generation that own it. Lazy-boundary
identity and activation generation remain runtime values rather than facade-cache keys, but an
activation may use only a facade from the exact artifact generation it loaded. Reusing immutable
facade output across compatible artifacts is an emission optimization; it does not merge their
component ownership, dependency slots, task generations, event queues, or cancellation.

Development invalidation covers provider package installation/removal, export maps, aliases,
enhancement metadata, authorization configuration, compiler reachability, and generated facade
content. A stale generation cannot retain or register a provider for the replacement generation.

Component testing consumes the same prepared provider/facade plan. A test may explicitly supply a
provider or the shared pass-through, but missing optional providers retain production fallback
semantics.

### Lazy activation and server continuation scope

An adapter receives the compiler-selected lazy artifact and, when required, the opaque server
continuation invocations produced by that activated artifact. It does not receive authority to
render the whole page, traverse a root component graph, or issue other operations exposed by the
same application build.

The activated island's dependency slice is fixed by generated contracts from compiled component contracts.
For an available enhancement provider, the adapter loads only the implementation selected by the
artifact-local facade. For an unavailable provider, the shared pass-through contributes no
component owner, dependency watcher, prerequisite edge, task, server invocation, or activation
readiness. Adapter resolution cannot turn optional absence into work that widens the island.

If activation invokes server continuations, the host creates a new request-scoped execution
machine from only the allowlisted operations and generation-stamped slots carried by that
invocation. Several compatible invocations may share one physical HTTP request or server batch,
but batching does not merge their logical island generations or authorize a union of unrelated page
operations. Server-homed dependencies resolve through the normal request context; the adapter must
not ask the browser to supply them or serialize server resources into facade metadata.

Facade generation, lazy artifact generation, provider implementation generation, and island
activation generation are validated before adoption or execution. Provider installation, removal,
HMR replacement, remote upgrade, or build replacement fences the old combination atomically. A
late loader, facade evaluation, or continuation result from a stale combination cannot adopt DOM,
publish state, replay an event, or register a provider in the replacement generation.

Immutable facade and island-slice plans may be cached at their separate build-owned identities.
Adapters must not retain request values, dependency snapshots, watchers, task frames, cancellation
controllers, queued events, component instances, or compiler graphs in either cache. Disposal of a
build or artifact generation releases its physical and virtual facade entries once active
generation fencing permits.

### Native Node execution

An unbundled Node server imports generated physical ESM facades through ordinary relative or
package-resolvable paths. It does not depend on an `exact:` URL scheme, rejected dynamic import, or
process-wide custom loader. The generator honors Node and import export conditions and emits only
server-admitted implementation paths.

Server startup may cache the prepared plan for its build identity. It must not retry missing
provider resolution per request or retain compiler/bundler graphs in the request runtime. A changed
provider graph creates and atomically activates a new development generation.

An island-triggered request selects an already prepared server facade plan by validated build and
artifact identity. Native Node resolution must not walk the package graph, regenerate facades, or
expand the compiler-authored continuation slice for that request. Missing, stale, or mismatched
identity fails before continuation execution rather than falling back to a broader root render.

Serverless and bundled server adapters may inline or virtualize facades, but their emitted module
contract must match native Node. CommonJS adapters, when supported, generate an equivalent
target-format facade rather than changing optional-provider behavior.

### Adapter conformance

Each advertised host verifies:

- real, declared pass-through, and shared pass-through providers;
- absent target runtime after valid compiler metadata established provider identity;
- malformed, incompatible, unauthorized, and evaluation-failing providers;
- browser/server export-condition selection;
- static reachability and tree shaking of the selected implementation only;
- HMR or watch replacement without stale provider registration;
- component-test equivalence;
- dynamic component chunks and provider generation fencing;
- paired SSR output and hydration ownership for structural and transparent enhancements;
- artifact-local facade reachability for eager roots, lazy islands, and server executors;
- enhanced lazy-island activation with real, declared pass-through, and shared pass-through
  providers without prerequisite-slice expansion;
- concurrent island activations whose server invocations are separate and physically batched;
- dependency changes, cancellation, replacement, provider installation/removal, HMR, and late
  results across the joint facade/artifact/activation generation fence; and
- native Node reuse of prepared plans with no per-request package resolution, compiler graph, or
  page-root execution fallback.

Unsupported tool versions or output formats fail explicitly. An adapter cannot silently fall back
to stale physical facade content or broaden an unavailable enhancement into required execution.

### Rejected alternatives

- Moving optional code from core into DOM does not help when the DOM entry remains reachable.
- One universal capability table imports every provider and defeats tree shaking.
- Runtime planning on every root cannot remove modules the browser already parsed.
- A page-wide union of lazy-artifact facades eagerly retains optional implementations and grants an
  adapter more reachability than any activated island owns.
- Caught dynamic imports can fail during bundler resolution before a promise exists.
- Bundler-only virtual modules leave native Node without a portable entry.
- A literal dummy component still allocates ownership; shared pass-through needs an identity fast
  path.
- Throwing for an absent attributed enhancement violates its bundle-time optionality.
- Authored feature flags or specialized imports duplicate facts already owned by the compiler.
