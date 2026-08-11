# Runtime-capability adapter and Node facade contract

## Status and ownership

This is the normative cross-host appendix to
[`compiler-authored-runtime-capabilities.md`](compiler-authored-runtime-capabilities.md). It is part
of that proposal, not a separate implementation stage or current framework contract.

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

Development invalidation covers provider package installation/removal, export maps, aliases,
enhancement metadata, authorization configuration, compiler reachability, and generated facade
content. A stale generation cannot retain or register a provider for the replacement generation.

Component testing consumes the same prepared catalog/facade plan. A test may explicitly supply a
provider or the shared pass-through, but missing optional providers retain production fallback
semantics.

## Native Node execution

An unbundled Node server imports generated physical ESM facades through ordinary relative or
package-resolvable paths. It does not depend on an `exact:` URL scheme, rejected dynamic import, or
process-wide custom loader. The generator honors Node and import export conditions and emits only
server-admitted implementation paths.

Server startup may cache the prepared plan for its build identity. It must not retry missing
provider resolution per request or retain compiler/bundler graphs in the request runtime. A changed
provider graph creates and atomically activates a new development generation.

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
- dynamic component chunks and provider generation fencing; and
- paired SSR output and hydration ownership for structural and transparent enhancements.

Unsupported tool versions or output formats fail explicitly. An adapter cannot silently fall back
to stale physical facade content or broaden an unavailable enhancement into required execution.

## Rejected alternatives

- Moving optional code from core into DOM does not help when the DOM entry remains reachable.
- One universal capability table imports every provider and defeats tree shaking.
- Runtime planning on every root cannot remove modules the browser already parsed.
- Caught dynamic imports can fail during bundler resolution before a promise exists.
- Bundler-only virtual modules leave native Node without a portable entry.
- A literal dummy component still allocates ownership; shared pass-through needs an identity fast
  path.
- Throwing for an absent attributed enhancement violates its bundle-time optionality.
- Authored feature flags or specialized imports duplicate facts already owned by the compiler.
