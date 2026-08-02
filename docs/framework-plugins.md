# Framework plugins

Status: implemented.

eXact framework plugins add cross-cutting behavior to compiler, server,
rendering, client, and testing hosts through one validated package protocol.
The implementation is divided between:

- `@exactjs/plugin-api`, which owns browser-safe public contracts and package
  participation helpers;
- `@exactjs/config`, which owns `exact.config.ts` loading and typed
  configuration;
- `@exactjs/plugin-host`, which owns Node-side discovery, trust, version
  selection, graph ordering, projections, lifecycle, and cleanup; and
- the compiler and host adapters, which consume prepared projections without
  reimplementing discovery.

`@exactjs/secrets` and `@exactjs/microfrontends` exercise the protocol as
official plugins.

## Discovery and trust

The host supports `root`, `trusted`, and `all` discovery modes. `trusted` is
the default and initially trusts packages in the `@exactjs/` scope. Package
ignores, required dependencies, supported host capabilities, and version
ranges are validated before plugin code participates.

Trusted plugin code executes in-process. Discovery is a supply-chain policy,
not a JavaScript sandbox. Applications should not trust a plugin package they
would not trust as build or server code.

Only one implementation of a canonical plugin may execute. When several
dependency branches expose candidates, the host selects a deterministic
compatible version or fails with provenance explaining the conflict.

## Configuration

`exact.config.ts` is the canonical application configuration. Plugins augment
its TypeScript shape and can contribute defaults or transformations through
the dependency graph.

Configuration order is deterministic:

1. plugin defaults;
2. dependency leaves before their consumers;
3. alphabetic order between ready peers; and
4. the application root last.

A transform that returns `undefined` retains the current configuration. A
returned value replaces it. Configuration may be asynchronous. Final
validation runs after every transform and before any host output is accepted.

Server-only configuration is projected only into hosts that need it. It must
not appear in client projections, generated client code, hydration data,
diagnostics, logs, or profile attributes.

## Host projections and lifecycle

A prepared registry can expose separate compiler, server, render, client, and
testing projections. Hosts run the shared lifecycle contracts rather than
inventing plugin-specific hooks.

Application and request resources are disposed in reverse acquisition order.
Cancellation and cleanup belong to the host scope that created the resource.
Build adapters invalidate prepared registries when configuration, plugin
manifests, or discovered package inputs change.

Output processing follows a strict boundary:

1. plugins may transform an output;
2. all final validators run;
3. validation failure prevents publication; and
4. no plugin may mutate the output after final validation.

## Authoring guidance

Use `@exactjs/plugin-api` for shared contracts and package participation. Use
`@exactjs/plugin-host/node` only in filesystem-backed hosts. Keep plugin
analysis data bounded and JSON-safe, declare capabilities and ordering
explicitly, and put host-specific behavior in the appropriate projection.

An application feature that can be expressed as a component, context, or
ordinary task should remain application code. A framework plugin is warranted
when the behavior must participate consistently in several compiler/runtime
hosts or enforce a cross-cutting boundary.

## Optional JSX enhancements

An attributed value import can establish a local namespaced JSX prefix for an optional ordinary
component enhancement. The compiler resolves the imported callable's public props, requires a
finite key space, maps kebab-case JSX members to camel-case props, reserves `children`, `key`, and
`ref`, and emits one grouped reactive marker. The compile-only import itself is erased.

```tsx
import motion from '@exactjs/motion' with { type: 'exact-plugin' };

<article motion:apply={fade} motion:layout-id={card.id} />;
```

An ordinary import cannot establish the prefix. Namespace imports, type-only bindings,
non-component values, open prop dictionaries, unknown members, and reserved members are compiler
diagnostics. Active renderer roots instantiate the mapped value as an ordinary inspectable
component; unavailable capabilities leave the intrinsic target unchanged and warn once.

Capability declaration and activation are separate stages. Compilation records every attributed
import without consulting a plugin registry because a library cannot know the final application's
bundle policy. The application build either includes that package capability or does not; bundling
the package is the activation trust decision. Vite links compiler-emitted module fragments into a
bundle-local generated catalog and supplies it to each renderer root through ordinary render
options. Hydration adopts the authored DOM before activating the same catalog, so transparent
enhancements preserve server node identity. Low-level renderer and component-test callers can
provide the bundle-local catalog explicitly.

Statically finite setup-derived spreads may contain namespaced keys. The compiler partitions only
the proven keys into the grouped marker, omits those exact keys from ordinary DOM props, and keeps
their reads reactive. Open dictionaries and effectful inline enhancement spreads are diagnostics.

The reserved `namespace:root` member is a routing selector, not an enhancement prop. The first
active matching selector in the declaration's logical subtree receives that enhancement; otherwise
the first intrinsic target is used. Selector changes reroute only the affected declaration subtree,
release the previous enhancement instance, and preserve the authored DOM identity.

Before setup, co-targeted enhancement components are ordered from their ordinary context effects:
providers wrap required and optional consumers, unrelated components use canonical identity, and a
cycle fails through the normal component error boundary before any member of the cycle runs.

## Current limitations

- Vite has the most complete automatic integration.
- Webpack and Bun use the shared contracts but individual plugins may expose a
  narrower host-specific feature set. Check the plugin and runtime docs.
- Compiler extensions may contribute bounded, validated analysis data retained
  only for the active compiler session.
- Compiler-emitted enhancement catalogs are still being connected into non-Vite build and render
  hosts; current low-level renderer callers can supply an explicit catalog.
