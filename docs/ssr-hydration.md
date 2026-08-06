# SSR and hydration

Status: implemented foundation with the explicit limits listed below.

## Package ownership

- `@exactjs/ssr` renders strings, documents, event streams, progressive HTML,
  hydratable output, and adapter-neutral response objects.
- `@exactjs/hydrate` adopts server DOM, activates client islands, invokes the
  server endpoint, validates results, and applies patches.
- `@exactjs/server` owns allowlisted invocation/refresh dispatch, request
  validation, authorization hooks, limits, and runtime-neutral adapters.
- `@exactjs/compiler` owns placement, artifact generation, operation
  contracts, hydration registration, and final client-bundle isolation.

## Server rendering

Native SSR emits deterministic markers for components, cells, dynamic
children, fragments, keyed lists, Suspense, Activity, client islands, and
compiler-planned server ranges. Multiple server descendants beneath one client
boundary retain independent plan-edge identities and adoptable DOM slots rather
than sharing one broad children slot. Active attributed enhancements remain
ordinary component owners in the same partition graph. Async string rendering drains observed
blocking work. Progressive
rendering emits a shell and can reveal settled Suspense ranges independently;
it falls back to an authoritative root replacement if work outside those
ranges changed.

Root-document mode accepts authored `html`, `head`, and `body` and inserts
framework-owned hydration or progressive-stream nodes into reserved positions.
Rendering applies output-size, task-pass, and task-duration limits.

The native compiler emits branded render programs for the first conservative fast-path subset:
attribute-free intrinsic HTML regions with static structure and independently addressable scalar
text expressions. Markerless SSR writes their escaped parts directly, client mounting clones a
cached inert template, and markerless hydration adopts them with compiler paths. Unsupported slot
shapes and host semantics use the lazy region-local VNode fallback.

Async SSR uses a request-owned FIFO scheduler for compiler-proven local, neutral, context-free
component sibling groups. `maxAsyncSsrConcurrency` defaults to 4, accepts 1 for serial execution,
and is capped at 32. Child frames isolate renderer state and merge in authored order. Marker-bearing,
document, inspection, React-compatible, nested-frame, and unproven groups remain serial.

## Hydration

Hydration adopts matching server nodes rather than recreating them. It
preserves element identity, form state, refs, handlers, retained Activity
ranges, and component ownership.

Schema-defined empty hydration metadata is omitted from compiler registrations and document
payloads. Hydration restores omitted continuation arrays and resumption arrays or objects with
shared immutable empty values. This compaction never applies recursively to authored state, props,
or public-context values, where an empty collection remains meaningful application data.
Applications whose client entry imports a generated hydration registration should set
`includeContinuations: false` in `createExactHydrationConfig()` so the HTML does not duplicate the
same continuation contracts.
When a lazy island later exposes the same compiler contract, hydration canonicalizes omitted empty
client fields before comparison. Equivalent repeat registration is idempotent; a materially
different contract with the same continuation identity remains an error.

Compiler-finite client boundaries are grouped once per response by component name and canonical
prop schema. Each boundary carries a compact table coordinate instead of repeating its component
name and serialized props; opaque spreads retain the self-describing representation. Hydration
validates the table, row arity, coordinate, and boundary identity before constructing props.

Progressive inline streams install one root-confined replacement helper on the first reveal and
emit small ordered calls afterward. `progressiveMode: 'inert'` continues to emit non-executable
template payloads. The helper refuses hydrated or foreign roots.

Component resumption records authorize state restoration only when the DOM
renderer has matched an SSR component marker and is constructing that exact
component for adoption. Compiled markers use the same contract identity as
resumption records. Mismatched route or conditional ranges mount as fresh client
instances, even while compatible ancestors continue adopting.

Finite component-registry selections retain the registry binding, selected
key, and opaque compiled entry identity in their component marker. A matching
selection adopts normally. A nested mismatch remounts only that owned
component range and preserves compatible sibling DOM; a root mismatch follows
the configured root recovery policy.

The compiler classifies safe interaction-only islands. Their SSR fallback
contains the real intrinsic markup and binding values but no active handlers.
The generated hydration registration uses dynamic imports, so the island code
loads on first supported interaction. While it loads:

- activation events retain their order;
- repeated input/change events coalesce to the latest value per target;
- replay is generation-fenced and discarded if the boundary was replaced; and
- load failure restores the native browser fallback where possible.

Refs, initial client work, opaque prop spreads, unsupported events, and
server-only child graphs remain eager.

## Server exchanges and patches

The endpoint supports individual invocation/refresh operations and same-tick
batches. Independent operations may run concurrently; `dependsOn` expresses an
explicit prerequisite. NDJSON responses can publish independently settled
operation chunks.

The client sends only compiler-approved state, dependency, capture, and
boundary snapshots. Successful responses are shape-validated before
application. Available patches include:

- text, attributes/properties, and styles;
- keyed-list changes;
- component state;
- compiler-stable dynamic range replacement;
- independent nested element replacement; and
- authoritative boundary replacement.

Stable dynamic markers let a server refresh replace one structural expression
without recreating unaffected siblings or component instances. Partition refresh
contracts authorize only their declared range and descendant ranges; a response
targeting an ancestor or independent sibling is rejected before publication.
Hosts that retain dynamic branch or keyed instances provide `resolvePartitionAuthority`
to the server runtime. The resolver returns the current build, edge, owner,
discriminator, and generation tuple; stale or released instances are rejected before
the refresh handler runs.
Boundary replacement remains the correctness fallback.

Runtime inspection exposes the same retained ranges through `partitions.tree`.
The Chromium DevTools component view shows their host, opaque plan identity,
component owner, discriminator kind, generation, and nested range ancestry without
turning inspection identities into dispatch authority.

## Data boundary

Hydration bootstrap data and protocol values use validated JSON-safe data.
Server requests bound and validate the complete encoded JSON graph before reactive protocol
decoding. Decoding reconstructs only plain data and validated collection envelopes, so dispatch
does not repeat the same graph traversal after reconstruction; operation contracts and security
hooks remain independent authoritative checks.
Compiler-approved `Map` and `Set` state uses tagged entries and is restored as
real collections; continuation changes travel as ordered entry or membership
deltas. Functions, DOM nodes, unsupported class instances, `Date`, cycles,
server contexts, and secret-qualified values are rejected.

## Remaining work

- [Compiler-owned render programs](proposals/compiler-owned-render-programs.md) must expand the
  initial scalar subset to finite attributes, styles, URLs, forms, events, refs, namespaces,
  inspection, and bounded enhancement targets.
- [Bounded deterministic async SSR](proposals/bounded-deterministic-async-ssr.md) still needs
  marker-range reservation, broader compiler proofs, adapter projection, and its full gates.
- [Compact hydration and progressive publication](proposals/compact-hydration-publication.md)
  still needs complete compiled adoption, independent-fragment fallbacks, atomic helper ownership,
  adapter projection, and its remaining byte/corruption/browser gates.
- [Compiler-planned structural refresh](proposals/compiler-planned-structural-refresh.md) for
  additional proven patch forms.
- [Broader lazy-island classification](proposals/lazy-interaction-islands.md) where source remains
  statically safe.
- [Full Webpack and Bun microfrontend production conformance](proposals/webpack-bun-microfrontend-parity.md).
- [Serializable partial-prerender resumption](proposals/partial-prerender-resumption.md); current
  progressive rendering does not persist opaque postponed renderer state.

See [server-components.md](server-components.md) for authoring and
[component-registries.md](component-registries.md) for finite dynamic
component selection,
[actions-and-forms.md](actions-and-forms.md) for task interactions and forms, and
[native-ssr-production-guide.md](native-ssr-production-guide.md) for production
operation.
