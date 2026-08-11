# Compiler-authored dynamic component boundaries

## Status

Proposed after the implemented
[`compiler-authored-runtime-capabilities.md`](../history/compiler-authored-runtime-capabilities.md),
[`compiler-authored-runtime-capabilities-adapters.md`](../history/compiler-authored-runtime-capabilities-adapters.md),
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md),
[`lazy-interaction-islands.md`](../history/lazy-interaction-islands.md), and
[`compiler-planned-component-execution.md`](../history/compiler-planned-component-execution.md).

This work is independent of partial-prerender resumption and structural-refresh optimization.
Local and application-bundled dynamic components do not depend on broader microfrontend adapter
parity. Loading an independently deployed remote component does depend on the existing
microfrontend trust and artifact contracts and on the applicable host adapter supporting them.

The annotation spelling `@exact dynamic` is provisional until implementation begins. Its semantics
and attachment rules are part of this proposal even if the final spelling changes.

## Decision

When a JSX component-position value is valid TypeScript but the compiler cannot prove one static
component or one finite component-registry entry, compile it as an explicit client-only dynamic
component boundary. Emit an actionable warning unless the value's owning declaration has the
eXact dynamic-component annotation.

The annotation is a semantic instruction, not a general diagnostic suppression. It says that the
author intentionally accepts runtime component selection and wants the compiler to emit a dynamic
boundary. It does not make an invalid JSX value valid, authorize server execution, permit source
evaluation, bypass component branding, or hide errors from an installed provider.

Enhancements and dynamic components share an internal conditional-implementation kernel for
availability, asynchronous resolution, cancellation, generation fencing, caching, and disposal.
They remain different render nodes:

- an enhancement decorates an existing target and preserves that target when unavailable;
- a dynamic component owns a child range and leaves its fallback or empty range when unavailable;
- an unavailable enhancement creates no component owner; and
- an unresolved dynamic boundary owns only its renderer range and resolution generation, creating
  a component owner only after a valid implementation is adopted.

The server never resolves or executes an open dynamic component. SSR emits the boundary's static
fallback and a compact client activation marker. A client-only page uses the same node without an
SSR marker. Finite registries remain the correct mechanism when the possible components are known
at compile time and should participate in SSR, hydration, static authorization, or exact chunk
planning.

## Goals

- Represent intentionally opaque component selection as a canonical compiler-owned render node.
- Keep ordinary TypeScript and JSX usable for imported, indexed, or provider-returned component
  values.
- Warn when runtime resolution is probably accidental while offering one narrow acknowledgement.
- Share proven enhancement-resolution machinery without conflating enhancement and component
  ownership.
- Preserve deterministic component identity, replacement, cleanup, and stale-result fencing.
- Keep unknown implementations out of SSR and out of server-operation authority.
- Support synchronous values, already-loaded indexed values, lazy client chunks, and authorized
  client-only remote component contracts through one availability model.
- Make the boundary and its resolution state visible in DevTools even before a component exists.
- Add no dynamic-component runtime code to artifacts containing only static components or finite
  registries.

## Non-goals

- Replacing `createComponentRegistry()` for finite component sets.
- Making arbitrary strings, URLs, module paths, functions, or objects executable components.
- Inferring server dispatch authority from a value observed in the browser.
- Rendering the eventually selected implementation during SSR.
- Turning a missing ordinary package import into optional behavior.
- Teaching bundlers to analyze arbitrary computed import expressions they do not otherwise support.
- Evaluating fetched JavaScript source, relaxing Content Security Policy, or adding a remote package
  installer.
- Treating annotation presence as proof of component validity, trust, placement, or compatibility.
- Retaining inactive component instances when selection changes.
- Adding a page-wide runtime registry containing every possible dynamic implementation.

## Authoring model

The preferred finite form remains:

```tsx
const Panels = createComponentRegistry(() => ({
	account: AccountPanel,
	billing: BillingPanel
}));

const Panel = Panels[this.state.panel];
return () => <Panel account={this.state.account} />;
```

An intentionally open selection may instead acknowledge the dynamic boundary:

```tsx
/** @exact dynamic */
const Panel = runtimePanels[this.state.panelName];

return () => <Panel account={this.state.account} />;
```

An opaque import is acknowledged through a local binding so the annotation applies to exactly one
component-position value:

```tsx
import { extensionEntry } from './installed-extension.js';

/** @exact dynamic */
const ExtensionPanel = extensionEntry;

return () => <ExtensionPanel />;
```

The initial annotation attachment set is deliberately narrow:

- a variable declaration;
- a parameter declaration; or
- a property declaration or property signature whose value is used in component position.

An annotation on an entire file, namespace, arbitrary expression, or unrelated ancestor does not
suppress the warning. An imported value can be assigned to a narrowly annotated local binding.
Destructuring and alias analysis may carry the annotation only while the compiler can prove the
same symbol; copying the value through an opaque function requires a new acknowledgement at the
component-position binding.

If the annotation is present but its binding is never eligible for component position, language
tooling reports an unnecessary or misplaced annotation. The annotation does not suppress ordinary
TypeScript JSX diagnostics. A value that TypeScript proves cannot be a component remains an error.

The compiler may recognize a future typed dynamic-provider result without warning, but that type
must describe the same runtime boundary contract. It cannot become a second component registry or
grant server authority. No public provider helper is required by this proposal's first delivery.

## Classification and diagnostics

The native compiler and language service use one shared classification result:

| Component-position value                        | Result                                        |
| ----------------------------------------------- | --------------------------------------------- |
| Static compiled component                       | Existing static component edge                |
| Finite registry selection                       | Existing registry range and entry identity    |
| Explicit React/foreign compatibility adaptation | Existing compatibility boundary               |
| Valid but opaque value with `@exact dynamic`    | Dynamic boundary without warning              |
| Valid but opaque value without annotation       | Dynamic boundary plus actionable warning      |
| Provably invalid component value                | Type/compiler error; annotation has no effect |

The shared warning should be equivalent to:

> Component identity cannot be determined statically. Prefer a finite component registry or a
> typed dynamic provider. Add `@exact dynamic` to acknowledge client-only runtime resolution.

Its stable diagnostic identity, source span, inference reasons, and suggested actions come from
the compiler analysis consumed by both build output and the LSP. The LSP offers quick fixes only
when it can safely identify the owning binding:

1. add the narrow annotation;
2. create or use a finite component registry when a finite candidate set is visible; or
3. cross the existing compatibility adapter when the value is provably foreign-owned.

Warnings may be promoted by an application's existing warning policy. The compiler still emits a
dynamic node for an unannotated valid value so development can continue. Malformed annotations,
invalid values, placement contradictions, unsupported imports, and unauthorized remote contracts
remain errors rather than warning variants.

## Compiled representation

The source JSX remains ordinary. Generated output contains a canonical node conceptually equivalent
to:

```ts
dynamicComponentNode({
	id: dynamicBoundaryId,
	resolve: () => Panel,
	props: compiledPropProgram,
	fallback: emptyRange
});
```

The actual representation is private and compact. It records:

- an opaque build-scoped boundary identity and source location;
- the client expression or provider slot that supplies the candidate;
- reactive dependencies that can change candidate selection;
- the ordinary compiled prop program and its dependencies;
- fallback, Suspense, Activity, error-boundary, and owned-range relationships;
- the required client capability import; and
- any authorized client-only lazy artifact or remote exposure identity known to the build host.

It does not contain source text, an authored variable name as protocol identity, a public module
path, a serialized function, or server dispatch authority. Modules containing a dynamic boundary
import a focused dynamic-component runtime capability and list it in their canonical component
definition. Other modules retain their current import and allocation closure.

The compiler emits the synthetic `<DynamicComponent>` entry in inspection metadata. This is a
DevTools node, not a literal HTML custom element and not a component instance. It reports source,
status, generation, provider or chunk provenance when safe, fallback ownership, and the adopted
component identity when available.

## Availability and resolution

The shared conditional-implementation kernel distinguishes:

- **unassigned:** the candidate-producing slot has not published;
- **pending:** an asynchronous provider generation is active;
- **absent:** the slot published `null` or `undefined`, or an explicitly optional provider reported
  absence;
- **available:** a validated implementation is ready for adoption; and
- **failed:** loading, validation, authorization, or evaluation failed.

This does not reintroduce task-readiness ambiguity. The candidate slot still uses an internal
unassigned sentinel, so an available JavaScript `undefined` can be observed and classified as the
dynamic component's absent outcome.

Selection changes create a new boundary generation. They request cancellation of the previous
load, prevent stale settlement from adopting a component, and dispose any replaced component
instance before the new implementation mounts. An A-to-B-to-A sequence may reuse an immutable
loaded module result when its artifact generation remains valid, but it does not retain or revive
the old A component instance.

Props published while resolution is pending coalesce into the newest complete prop snapshot. Once
adopted, ordinary compiled prop forwarding handles subsequent changes. Candidate and prop changes
in one reactive transaction settle against one version vector. Parent replacement, key change,
boundary disposal, HMR replacement, remote upgrade, or root abort releases the loader generation,
range, subscriptions, and any adopted child owner.

A resolved value is accepted only when it is:

- a compatible compiler-branded eXact component;
- an explicitly branded and adapted foreign component; or
- an authorized client-only remote component facade that resolves to one of those values.

An arbitrary callable is not executed to discover whether it behaves like a component. Invalid
resolution enters the ordinary error-boundary path with source-linked diagnostics. Pending state
uses the enclosing Suspense or Activity policy where present; otherwise the boundary retains its
empty range. Absence is not an error and retains the fallback or empty range.

## SSR, hydration, and client-only rendering

SSR creates the dynamic boundary's stable range but never evaluates its candidate expression,
imports its implementation, runs its setup description, issues its tasks, or follows its child
graph. It may render a compiler-proven static fallback. The response carries only the compact
boundary activation and authorized prop/resumption inputs required by the client; it never
serializes the candidate value or a module path.

Hydration adopts the fallback range and starts the current client resolution generation. Adoption
of the resolved component mounts inside that owned range, so it is not an SSR mismatch and cannot
replace compatible siblings or ancestors. A stale resolver cannot mutate the range after its
generation or owner has been released.

On a client-only page, the renderer creates the same owned range directly and begins resolution.
No alternate component or lifecycle model is introduced.

An open dynamic component cannot own or invoke an eXact server continuation, action, refresh
operation, server task executor, or server-homed dependency. This prohibition is absolute for this
node type: authorization of a remote package or exposure does not relax it. Resolution validates
the complete attached capability contract before setup or mounting and rejects any implementation
with server execution capability. A server-enabled remote must cross the explicit microfrontend or
statically authorized component boundary instead of this generic dynamic boundary. The browser
never promotes a module path or observed operation into server authority.

This is a framework execution guarantee, not a JavaScript network sandbox. A client implementation
can still use browser APIs such as `fetch` unless the application executes it in a separately
sandboxed environment. The dynamic-component runtime itself supplies no eXact server transport,
operation identity, or dispatch capability.

Partial-prerender checkpoints may retain an unresolved dynamic boundary as client activation data
only. They do not persist its loader, promise, candidate, or possible implementation graph, and
resumption never resolves it on the server.

## Build-host and loading contract

The compiler describes the loading form it can prove; adapters do not invent reachability:

- an already imported opaque value uses the normal static module graph;
- an indexed value already in client memory needs no adapter loader;
- a literal or bundler-supported lazy import retains its ordinary client chunk;
- an application provider may publish a branded component value through its own client transport;
  and
- an independently deployed remote must use the existing microfrontend exposure, build identity,
  authorization, and upgrade-fencing contracts and must prove that its selected component has no
  server execution capability.

The annotation cannot make an unsupported computed import analyzable and cannot make a missing
ordinary import optional. Enhancement facades retain their separate promise that provider absence
does not fail the consuming build. If optional dynamic component packages are later desired, they
require an explicit provider/facade contract rather than caught arbitrary imports.

Vite, Webpack, Bun, component-test hosts, and client-only Node build pipelines consume the same
compiler node and loading facts. Native Node SSR recognizes the node only to emit its fallback and
activation marker; it never resolves the client implementation. Adapter caches may retain immutable
artifact resolution results but not boundary generations, props, component instances, promises,
subscriptions, or errors from an application lifetime.

## Relationship to enhancements

The reusable internal kernel owns:

- availability transitions;
- one current generation and cancellation root;
- immutable implementation-result caching;
- stale-settlement fencing;
- validation handoff; and
- disposal of resolution resources.

The enhancement renderer continues to own target preservation, activator grouping, root-frame
authority, shared props, ordering, and pass-through behavior. The dynamic-component renderer owns
an empty or fallback range, exactly one selected child component, prop forwarding, selection
replacement, and client activation. Neither path is implemented by pretending the other node type
exists, and neither introduces a universal runtime provider registry.

## Performance and memory requirements

- Static components and finite registries import no dynamic-component capability because this
  proposal exists.
- An unresolved boundary allocates at most its range, compact status/generation state, and the
  subscriptions proven for candidate and prop selection.
- Candidate changes reuse the status record and release the prior loader controller and component
  owner deterministically.
- Loaded implementation caching uses artifact/provider identity and weak ownership where possible;
  it is never keyed by props or arbitrary authored object equality.
- HMR and remote build replacement release superseded cache generations after active consumers
  settle or dispose.
- SSR allocates no candidate loader, dynamic child component, task owner, or package-resolution
  state per request.

Benchmarks must compare a static component, finite registry selection, synchronous dynamic value,
pending lazy value, and repeated selection replacement. Report client bundle bytes, module
evaluation, mount and replacement CPU, allocation and retained heap, and stale-load cancellation.

## Delivery order

1. Add the shared compiler classification and diagnostic fact consumed by build and language tools.
2. Ratify the annotation spelling and implement narrow symbol attachment plus LSP quick fixes.
3. Emit the canonical dynamic node and focused client runtime capability for synchronous values.
4. Implement owned-range adoption, replacement, branding validation, disposal, and DevTools state.
5. Add asynchronous provider availability, cancellation, Suspense/error integration, and caching.
6. Emit SSR fallback/activation markers and verify hydration plus client-only rendering.
7. Extract the shared conditional-implementation kernel from enhancement resolution without
   changing enhancement behavior.
8. Add Vite, Webpack, Bun, component-test, and native Node SSR conformance.
9. Integrate authorized client-only microfrontend values through the existing remote artifact
   contract and reject every server-capable candidate before setup or mounting.
10. Record bundle, CPU, cancellation, and retained-heap measurements before marking complete.

## Verification

- Compiler tests for static, registry, adapted, annotated dynamic, unannotated dynamic, and invalid
  JSX values.
- Exact-output tests proving only dynamic modules import the focused runtime capability.
- Shared compiler/LSP diagnostic identity, source range, hover explanation, and safe quick fixes.
- Tests proving annotations do not suppress TypeScript errors, placement errors, unsupported import
  errors, malformed provider errors, or remote authorization failures.
- DOM lifecycle tests for synchronous adoption, absent values, fallback ranges, prop updates,
  identity preservation, replacement, keys, refs, cleanup, and parent disposal.
- Generation tests for pending changes, A-to-B-to-A, cancellation failure, late success/failure,
  HMR, remote upgrade, and root replacement.
- SSR tests proving candidate expressions, imports, component setup, tasks, and child graphs never
  execute while fallback and activation markers remain deterministic.
- Hydration and client-only tests proving range-local mount without sibling replacement.
- Security tests proving arbitrary functions, strings, module objects, paths, source text, and
  browser-observed server operations cannot become executable authority.
- Contract tests rejecting local, lazy, adapted, and remote candidates that declare an eXact server
  continuation, action, refresh operation, executor, or server-homed dependency.
- Enhancement regression tests proving shared-kernel extraction retains optional pass-through,
  target ownership, ordering, task cleanup, and zero-owner absence.
- Vite, Webpack, Bun, component-test, and Node SSR adapter fixtures for supported loading forms.
- Browser tests for DevTools `<DynamicComponent>` pending, absent, failed, available, replaced, and
  disposed states.
- Allocation and long-running replacement tests proving loaders, generations, instances, and
  artifact caches are released.

## Acceptance criteria

1. Every valid opaque JSX component value becomes an explicit client-only dynamic boundary rather
   than an ordinary component call or silent runtime guess.
2. Unannotated opaque values produce one shared compiler/LSP warning with actionable alternatives.
3. The narrow annotation suppresses only that warning and cannot make invalid or unauthorized
   values valid.
4. Static components and finite registries preserve their current SSR, hydration, authorization,
   tree-shaking, and lifecycle behavior.
5. SSR never resolves or executes the dynamic candidate, and resolution rejects every candidate
   with eXact server execution capability before setup or mounting.
6. The client accepts only compiler-branded, explicitly adapted, or independently authorized
   implementations.
7. Selection and provider changes are cancellation-aware, generation-fenced, range-local, and
   deterministically dispose replaced owners.
8. Enhancements and dynamic components share resolution mechanics without sharing fallback,
   composition, component ownership, or renderer semantics.
9. Vite, Webpack, Bun, component tests, native Node SSR, hydration, and client-only rendering agree
   on the same compiler-authored node and supported loading forms.
10. DevTools exposes the synthetic boundary and current resolution state without fabricating a
    component instance.
11. Dynamic runtime bytes and allocations are absent from artifacts and instances that cannot use
    the feature.
12. Long-running cancellation and replacement tests show no retained component, loader, request,
    subscription, or obsolete artifact generation.
