# Runtime-capability adapter and Node facade contract

## Status and ownership

This is the normative cross-host appendix to
[`compiler-authored-runtime-capabilities.md`](compiler-authored-runtime-capabilities.md). It is part
of that proposal, not a separate implementation stage or current framework contract.

The main proposal owns component state-machine, continuation-readiness, and lazy-island dependency
semantics. This appendix defines how build and server hosts preserve those decisions. An adapter may
project, cache, or materialize a compiler-authored plan, but it must not recompute capability
reachability, widen an activation root, or discover additional prerequisite work at runtime.

## Portable generated facades

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

## Prepared facade plan

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

## Lazy activation and server continuation scope

An adapter receives the compiler-selected lazy artifact and, when required, the opaque server
continuation invocations produced by that activated artifact. It does not receive authority to
render the whole page, traverse a root component graph, or issue other operations exposed by the
same application build.

The activated island's dependency slice is fixed by generated contracts from the main proposal.
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

## Native Node execution

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

## Adapter conformance

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

## Rejected alternatives

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
