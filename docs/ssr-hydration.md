# SSR and hydration

Status: implemented foundation with the explicit limits listed below.

## Package ownership

- `@exactjs/ssr` renders strings, documents, event streams, progressive HTML,
  hydratable output, and adapter-neutral response objects.
- `@exactjs/hydrate` adopts server DOM, activates client islands, invokes the
  server endpoint, validates results, and applies patches.
- `@exactjs/hydrate/root` is the statically selectable hydration-only facade for applications
  without compiler-generated server operations, response patches, or client islands. Its root
  owns adoption and disposal but does not retain those optional modules in the browser graph.
  Its `hydrateAfterNavigation()` entry schedules user-blocking adoption outside the
  DOMContentLoaded critical path and uses an interaction-capture fallback so an earlier user action
  activates the root first.
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

The native compiler emits branded render programs for compiler-finite intrinsic regions. HTML,
SVG, MathML, scalar text, finite host properties and attributes, classes, styles, URLs, ordinary
form controls, events, and refs reuse the same host operations as generic rendering. Markerless SSR
writes escaped parts directly, client mounting clones a cached inert template, and markerless
hydration adopts with compiler paths. Nested conditional regions retain the namespace established
by their intrinsic JSX ancestors, and standalone SVG or MathML programs mount through a
namespace-correct template. Structural, marker-bearing, enhancement-routed,
opaque-spread, raw-content, and otherwise unproven regions use the lazy region-local VNode fallback.

Async SSR uses a request-owned FIFO scheduler for compiler-proven local, neutral, context-free
component sibling groups. `maxAsyncSsrConcurrency` defaults to 4, accepts 1 for serial execution,
and is capped at 32. Child frames isolate renderer state and merge in authored order. Nested proven
groups temporarily yield their parent permit and reuse the same request-wide scheduler, avoiding
both multiplied concurrency and deadlock. Marker-bearing, document, inspection, React-compatible,
callback-observed, and unproven groups remain serial.

Components with compiler-attached execution subgraphs wire reachable child components before
waiting for their own setup continuations. Ready root task generations enter that same request
scheduler, while nested task frames retain the parent's permit. This removes the recursive async
discovery waterfall without building or flattening a request-wide plan. Uncompiled components keep
the ordinary drain-before-render path, and structural render reachability still prevents inactive
branches or unselected dynamic components from starting work.

After output extensions choose the rendered root, SSR reuses a root-keyed immutable execution
blueprint. It caches validated contracts and prepared lookup indexes for components reached beneath
that root, including dynamic components on first use. Weak keys avoid retaining replaced dynamic
components, and an attachment or compiler-identity change forces validation and preparation again.
The cache contains no props, contexts, state, task generations, cancellation, or other request data.
Per request, components allocate only their compact value slots and the watchers required by actual
transitions; components without transitions skip continuation-frame allocation entirely.

## Hydration

Hydration adopts matching server nodes rather than recreating them. It
preserves element identity, form state, refs, handlers, retained Activity
ranges, and component ownership.

Compiler-cell roots adopt their existing cell range directly; they do not pass through static-tree
repair or clear the root container. Compiler-proven native component calls use the component's own
identity marker without an additional cell marker pair. Intrinsic cells and structural expression
ranges retain their markers because those ranges still own independent reactive updates.
Compiler render programs adopt their marked intrinsic nodes and scalar slots through the program's
stable element and slot identities. They retain the SSR DOM and marker protocol without rebuilding
an equivalent generic Cell/Dynamic mount graph. Initial adopted prop binding is covered by the
root-level focus/form snapshot, so it does not repeat focus inspection for every intrinsic.
Completed component mounts cache their first target and host candidates; parent publication reuses
those structural results instead of recursively rediscovering roots through nested components.

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
Malformed rows are isolated from valid siblings. Interaction-only compact boundaries retain the
shared table without per-boundary props objects until activation, and the table is released after
the final dormant coordinate is claimed.

Progressive inline streams install one root-confined replacement helper on the first reveal and
emit small ordered calls afterward. `progressiveMode: 'inert'` continues to emit non-executable
template payloads. Root hydration derives and removes the response helper before publishing
hydrated ownership, while any late reveal observes the hydrated root and refuses to mutate it.

Component resumption records authorize state restoration only when the DOM
renderer has matched an SSR component marker and is constructing that exact
component for adoption. Compiled markers use the same contract identity as
resumption records. Mismatched route or conditional ranges mount as fresh client
instances, even while compatible ancestors continue adopting.
Records are consumed in their per-component construction order rather than one global cross-type
order. SSR preparation may construct different component types ahead of their final DOM order;
that preparation detail cannot invalidate otherwise matching client adoption. Adoption checkpoints
still return any consumed records when a candidate range fails.

Root hydration parses and validates its embedded bootstrap configuration once, then passes the
resolved immutable inputs into client construction. Static scalar DOM props bypass reactive watcher
construction; compiler expressions and supported composite class or `srcdoc` values retain observed
bindings.

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
component owner, activation mode and fallback reason, discriminator kind, generation, and nested range ancestry without
turning inspection identities into dispatch authority.

Compiler-proven interaction islands install only the delegated listeners named by their generated
registry policy. `click` and `submit` resume through native `click()` and `requestSubmit()`;
`input` and `change` preserve the browser's already-applied control mutation and coalesce to the
latest value; focus events replay notification only. Queues retain identities and policy fields,
never native `Event` objects, and are generation-fenced and bounded. Refs, unsupported events or
event data, observable initial work, and non-finite spreads produce source-located eager reasons.
Finite immutable object spreads are expanded in source overwrite order, leaving handlers in the
client artifact and sending only fallback values through SSR. Independently planned server ranges
remain inert inside a dormant client island and retain their own refresh generation.

Passive hydration does not manufacture a focus transition when the document body owns focus. When
an authored control already owns focus, DOM adoption and later reactive patches preserve that
connected element and its input or editable selection if browser DOM work temporarily drops focus.

When an interaction island loads, hydration prepares its immutable component execution slice from
the compiled definition and caches it by component artifact. Adoption installs only the root's
authorized setup-transition watchers; already-resumed continuations suppress their initial
generation, while unresolved live-ins use the declared predecessor slots. Dependency cycles fail
the activation instead of leaving it indefinitely loading. The slice exists only while the island
region is constructed, so it cannot suppress or activate unrelated dormant components. Boundary
generation replacement, abort, or unmount continues to fence loader completion, queued events, and
task publications.

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

- Measured [structural render-program refresh extensions](proposals/compiler-planned-structural-refresh.md)
  may add proven patch fast paths, but current range and boundary replacement is already the
  correctness contract and does not block later SSR work.
- Webpack, Bun, and Vite/Rollup now share the production microfrontend artifact and recovery contract.
- Persisting postponed renderer state across requests is intentionally not planned: ordinary
  Suspense and progressive SSR provide the useful behavior without checkpoint reconstruction and
  distributed replay coordination.

See [server-components.md](server-components.md) for authoring and
[component-registries.md](component-registries.md) for finite dynamic
component selection,
[actions-and-forms.md](actions-and-forms.md) for task interactions and forms, and
[native-ssr-production-guide.md](native-ssr-production-guide.md) for production
operation.
