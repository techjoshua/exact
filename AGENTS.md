# Agent guidance

## Preserve what makes eXact different

eXact is a compiler-led web framework, not a React dialect. Its TSX is intentionally familiar,
but its component, state, update, lifecycle, and server models have different goals. Do not
mechanically translate React architecture into native eXact code.

### Component and update model

React function components execute again to describe the interface after an update. Hooks associate
state and effects with those executions through a stable call order, and React reconciles the new
description with the previous one.

An eXact component is a long-lived, inspectable component instance:

- The outer component function is setup. It normally runs once for each instance and returns the
  render function containing JSX.
- State belongs directly to the instance as `this.state`. Read and mutate it normally instead of
  introducing setters, reducers, dispatchers, or immutable replacement by habit.
- The compiler connects state reads to the specific DOM expressions, derived values, tasks, or
  server operations that consume them. An update should normally rerun only the affected work, not
  the entire component.
- Lifecycle registrations, contexts, refs, tasks, and owned resources are established against the
  durable instance and must be released with that instance.

Do not introduce React-style Hooks, positional state, render-phase side-effect rules,
`useMemo`/`useCallback` ceremony, or a general rerender-and-virtual-DOM loop into native eXact
features. Memoization and immutable data still have legitimate uses, but repeated component
execution is not the default problem they should be compensating for.

### State should remain observable

Inspectable state is an intentional debugging, testing, and operational property, not an
encapsulation failure. Prefer APIs and internal designs that retain a coherent component instance
whose state, tasks, resources, ownership, and lifecycle can be understood when something goes
wrong. Test public behavior by default, but do not make component state inaccessible merely to
imitate React's ownership model.

Props remain parent-owned inputs. Local mutable data belongs in `this.state`; derived data should
usually remain an ordinary compiler-observed expression or an explicit reactive value when a
first-class value is useful.

### JSX is source syntax, not the runtime architecture

Familiar JSX should make eXact easy to read without importing React's semantics:

- Preserve expression-level reactivity instead of treating JSX as a request to rerender the whole
  component.
- Prefer eXact's compiler-supported bindings, event typing, list identity, tasks, and placement
  features when they remove real source ceremony.
- Keep generated complexity in the compiler and runtime when that leaves application source
  ordinary, explicit, and maintainable.
- Treat React compatibility as an adoption boundary for React-owned code. It is not the design
  template for native eXact components or packages.

### Server and client are one coordinated framework

Server rendering, hydration, client islands, actions, refreshes, tasks, and server components are
parts of one compiler-checked model. Preserve explicit placement, compiler-generated protocol
contracts, allowlisted dispatch, serialization validation, ownership, and cancellation across the
boundary. Do not create durable APIs that depend on the current manifest representation; generated
operation identifiers should remain opaque outside the transport. Do not reshape these features
around React Server Component assumptions or require application authors to manually reproduce
transport plumbing that the compiler can safely generate.

When choosing between designs, favor the one that advances eXact's central goals: ordinary
TypeScript and TSX, setup-once inspectable components, precise reactive work, deterministic
ownership and cleanup, and understandable automatic client/server coordination. A design that
requires repeated component execution, hides state behind a runtime dispatcher, or adds
React-derived ceremony should have a specific eXact reason rather than familiarity as its
justification.

## The seat-belt rule for testing

Treat tests like seat belts: add protection in proportion to the risk of the journey.

A slow vehicle on a closed track may need little protection. A road car needs a seat belt. A
fighter jet needs several restraints. Spaceflight needs full-body protection. Software follows
the same principle: greater complexity, consequence, uncertainty, or exposure requires stronger
and more layered testing.

Do not use a uniform coverage percentage as a substitute for judgment. Line coverage shows which
code executed; it does not show whether important risks, invariants, or failure modes were tested.
High coverage of trivial code must not compensate for weak protection around a critical boundary.

### Match protection to risk

- Low-risk declarations, forwarding code, static configuration, and obvious plumbing may need
  only a smoke test, integration coverage, or no dedicated test.
- Ordinary public behavior should have representative success, failure, and lifecycle coverage.
- Complex stateful code should protect its invariants, transitions, cleanup, cancellation,
  concurrency, and regression cases.
- Security-sensitive or mission-critical boundaries should use overlapping protection where
  appropriate: focused tests, integration tests, adversarial inputs, invariant or property tests,
  and end-to-end verification.

For eXact, give especially careful attention to compiler semantics, reactive transactions, DOM
identity and reconciliation, hydration integrity, server dispatch, secrets, lifecycle ownership,
resource cleanup, and server/client or runtime boundaries.

### Account for the cost of restraint

Seat belts must be removed when leaving a vehicle. Tests likewise impose a cost when code is
rewritten. A test coupled to incidental implementation details can obstruct a safe refactor even
when the observable contract remains unchanged.

- Prefer tests of stable contracts, observable behavior, invariants, and failure boundaries.
- Do not preserve an implementation detail merely because a test encodes it.
- Avoid exhaustive low-value unit tests when a smaller number of integration or contract tests
  provides the same confidence with less coupling.
- Use exact output snapshots only when the exact representation is itself a supported contract.
  For compiler work, prefer semantic equivalence, diagnostics, placement invariants, and runtime
  behavior when those are the real promises.
- Treat test complexity, execution time, brittleness, and rewrite cost as part of the test's cost.
- When an intentional redesign invalidates implementation-coupled tests, remove or replace those
  tests. Do not mechanically reproduce obsolete expectations.

### Working rule

Before adding or retaining a test, identify:

1. The failure or regression it protects against.
2. The consequence and likelihood of that failure.
3. The least-coupled test layer that provides adequate confidence.
4. Whether the protection justifies its maintenance and rewrite cost.

The goal is not maximum test count or coverage. Use the minimum restraint that makes the expected
journey acceptably safe, with additional independent protection where failure would be unusually
costly.
