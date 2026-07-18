# Native SSR And Server Components Adversarial Review

Date: 2026-07-18

> Historical note: the package-provenance, selector-grant, forwarding-analysis,
> scoped-resolver, and runtime-audit findings below describe the discarded
> Phase 6 implementation. The current design is intentionally smaller:
> transparent compiler-qualified values, derived-value propagation, explicit
> `Secret<T>` call contracts, compiler-emitted type preservation, explicit
> `consume()` boundaries, application ownership, a consuming-package allowlist,
> and enforcement at client artifact and server-to-client transfer boundaries.
> Those permissions are guardrails, not dependency sandboxing.

## Scope

This review challenged the completed six-phase native SSR and server-component
program at its trust boundaries rather than treating passing happy-path tests
as sufficient. It covered renderer replacement, document augmentation,
request/application lifetime, component context lifetime, artifact selection,
descriptor minification and tree shaking, response commitment, secret flow,
package provenance, runtime resolver access, generated samples, and schema
consumers.

## Findings Resolved

### Dependency-declared integrity was not authoritative

The initial Phase 6 implementation could read an integrity label associated
with an installed package. A package can modify its own metadata, so accepting
that label as proof would have been security theater.

Resolution:

- Installed-package discovery now obtains integrity from the consuming
  application's npm package lock.
- Discovery overlays identity and provenance from the package boundary and
  lock rather than trusting the distributable compiler manifest.
- A grant that pins integrity fails closed when no authoritative lock entry is
  available or when the digest differs.
- The installed tarball fixture verifies the lock-derived version and integrity
  in both discovery output and the compiler manifest.

### A granted wrapper could have hidden a downstream recipient

Checking only the package directly called by application code would make grants
transitive in practice. A dependency could forward a secret argument to another
package while the application audit showed only the wrapper.

Resolution:

- Callable summaries now retain direct parameter-to-argument bindings.
- Application compilation follows those bindings through local helper chains,
  aliases, and exported wrapper symbols.
- Every downstream package is emitted as a separate receipt and requires its
  own package-and-selector grant.
- A regression test grants `@acme/payments` while confirming that forwarding to
  `@untrusted/gateway` remains denied.

### Local secret propagation used a name-based callable lookup

A name-indexed lookup is unsafe in the presence of shadowed functions and
assigned arrow functions because it can associate a call with the wrong
parameter set.

Resolution:

- Local call propagation now keys functions by canonical binding identity.
- Function declarations and variable-bound functions use their actual semantic
  variable, so lexical shadowing cannot redirect policy propagation.
- A regression test passes a secret to a shadowed local helper and verifies
  that an unrelated same-named gateway wrapper is not treated as a recipient.

### Aggregate reports understated grant breadth

A grant was considered used when any selector matched, which hid unused
selectors inside that grant and gave wildcard authorization no explicit review
signal.

Resolution:

- Reports now track selector use within each grant.
- Unused grants, unused selectors within used grants, and used wildcard
  selectors receive distinct deterministic warnings.
- Dynamic selectors require `*` and the resulting report explicitly calls out
  that breadth.

### Symlink provenance existed behind unreachable discovery logic

Package discovery could classify a resolved package as `symlink`, but its
directory walk discarded symlink entries before reading their package metadata.
That left the workspace/symlink branch untested and ineffective.

Resolution:

- Discovery now admits symlinks only when their resolved target is a directory.
- Linked packages retain `symlink` provenance, package identity, and version.
- They remain dependencies for permission purposes and never inherit the root
  application's implicit-owner exception.
- A Windows-junction/portable-directory-symlink fixture verifies the path.

### Compiler and server manifest versions could drift

The compiler and server briefly carried different prepublish schema numbers,
which appeared when integration paths loaded stale generated JSON. Because no
manifest format has been published or consumed outside this repository, the
current compiler/server contract is reset to version 1 rather than preserving
internal development increments.

The server-component and shipping samples regenerate their artifacts before
tests, so repository-owned manifests exercise the current schema instead of
relying on stale ignored output.

### Secret resolver access was broader than the intended capability

An unrestricted `get(name)` API would let any recipient of the resolver request
every configured secret.

Historical resolution:

- The discarded implementation introduced scoped resolvers, selector grants,
  runtime audit events, and opaque non-serializable wrappers.
- Those mechanisms are not part of the current design. The application owns
  its resolver, dependencies accept still-qualified values only through
  explicit `Secret<T>` parameters, and the compiler tracks transparent
  secret-qualified values until code in the trusted package calls `consume()`.

## Rechecked Boundaries

- Unsafe HTML remains opaque and whole-range, requires application opt-in, and
  imported package use requires a non-transitive grant.
- Native `dangerouslySetInnerHTML` is rejected.
- URL checks cover SSR, DOM creation, hydration comparison, patch application,
  and reactive updates using the same React-compatible baseline.
- Root document augmentation preserves authored `html`, `head`, and `body`
  structure while reserving framework-owned insertions.
- Request and application scopes are host-created; component providers remain
  component-scoped even when their values derive from request/application data.
- Isomorphic availability is inferred; it is not a `keep` residency mode.
- Shared and dual declarations are exported for generated cross-artifact
  imports without being implicitly promoted into the public package barrel.
- Response state is snapshotted at commitment and cannot be mutated afterward.
- Component descriptors use global symbols and positional tuples, survive
  minification, preserve aliases/default exports, and tree-shake when unused.
- Lazy component chunks carry their descriptor with the exported function.
- A side-effect-free component package retains the used component's CSS Module
  while Vite removes the unused component and its stylesheet through a root
  barrel.
- Installed package manifests are discovered from advertised package metadata
  and their embedded package identity is overwritten by resolved provenance.

## Completion Evidence

The completion audit mapped each phase to current implementation and executable
evidence:

| Phase | Authoritative evidence |
| --- | --- |
| 1. Renderer/document safety | Native DOM, SSR, and hydration suites cover authoritative replacement, opaque raw HTML, intrinsic scripts, centralized URL blocking, authored document roots, CSP nonces, and inert progressive payloads. Compiler capability tests cover application opt-in and non-transitive dependency grants. |
| 2. Request/application scope | Request and server-context suites cover normalized requests, pre-root providers, lifetime validation, cycles, concurrent isolation, cancellation, reverse-order disposal, warm-runtime reuse, test overrides, stream ownership, and the shared SSR/action/refresh scope. Adapter suites exercise their platform request mappings. |
| 3. Generic policy/context transfer | Annotation and policy suites cover the closed `keep` vocabulary, inferred isomorphic transfer, server/secret rejection from client artifacts, alias/return/state/context propagation, and imported-manifest validation. The native server-component application verifies reconstructed brand/authorization methods and independent server-action authorization. |
| 4. Component packages | Compiler artifact suites cover shared/dual emission, internal exports, conditional-target assertions, descriptors, aliases/defaults/cycles, minification, tree shaking, lazy chunks, and CSS Modules through a root barrel. The packed-package fixture installs one tarball and loads client, SSR, and server-component conditions with automatic manifest discovery. |
| 5. Production certification | Request, server, SSR, hydration, and adapter suites cover commitment, redirects, headers, streaming failure, cancellation, budgets, authorization, CSRF, and cleanup. The shipping application builds production client and SSR bundles, while the production guide records deployment, cache, CSP, observability, and publication requirements. |
| 6. Secret permissions/audit | Secret and policy-report suites cover transparent runtime values, compiler-derived propagation and emitted `Secret<T>` qualification, explicit parameter contracts and `consume()` boundaries, application ownership, consuming-package permissions, shadowed bindings, unused-permission warnings, client-artifact rejection, VNode/error sinks, and bounded secret-controlled branch propagation. |

Final repository gates on this reviewed state:

- `npm.cmd run test:packages`: 1,035 package tests, 4 native
  server-component tests, and
  16 shipping tests passed.
- `npm.cmd run typecheck`: the project-reference type check passed.
- `npm.cmd run build:shipping`: the Vite client build transformed 48 modules
  and the SSR build transformed 47 modules.
- Regenerating the native server-component artifacts twice from identical
  inputs produced byte-identical outputs.
- `git diff --check` passed before commit.

## Residual Limits And Non-Goals

These are not silent correctness promises:

- eXact does not sandbox arbitrary in-process server JavaScript. A dependency
  may use Node or platform capabilities outside the secret resolver and
  renderer. Resolver least privilege is capability-by-possession: the host must
  pass dependencies only their scoped resolver, never the resolver factory.
- Lock-derived integrity currently recognizes npm `package-lock.json`.
  Integrity-pinned grants under other package managers fail closed until an
  authoritative adapter is implemented.
- Direct DOM, network, `eval`, and other platform APIs remain outside renderer
  URL/raw-HTML policy.
- Caller-side `consume()` ends compiler tracking and transfers responsibility
  for the ordinary value to trusted server code. Before that boundary, a
  secret-qualified value cannot be projected into isomorphic state or
  framework-owned output.
- Passing an unconsumed secret through an explicit `Secret<T>` parameter
  preserves qualification and is not itself a consumption or permission event.
- Shared artifact extraction is intentionally whole-module in the initial
  implementation. Per-declaration partitioning is an optimization.
- Nested document metadata collection and generalized URL policy plugins remain
  explicitly deferred features. Strict no-inline rendering already emits inert
  progressive payloads; only a standardized external consumer protocol remains
  deferred.

## Conclusion

The renderer, context, component-package, and response-lifecycle findings remain
useful. The secret-package hardening findings are historical and no longer
describe the implementation; the simplified model deliberately removes their
provenance, selector, integrity, transitive-flow, and scoped-resolver claims.
