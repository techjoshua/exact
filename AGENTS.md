# Agent guidance

## Maintainability requirements

All repository changes must follow the
[code maintainability standard](docs/code-maintainability.md). Treat its module ownership, JSDoc,
testing, and change-acceptance rules as required review criteria rather than optional cleanup.

## Keep documentation and agent guidance synchronized

Every feature addition, removal, or behavior change must update all relevant engineering
documentation under [`docs`](docs) and the public documentation application under
[`apps/docs`](apps/docs). Treat those updates as part of the feature, not optional follow-up work.
Create, remove, split, combine, or reorganize reference documents and docs-app pages when that
best reflects the resulting framework. Keep proposal status, current references, docs-app route
metadata, navigation, search terms, examples, and stated limitations consistent with the
implemented behavior.

Repository maintenance guidance belongs in this root `AGENTS.md`. Package-local `AGENTS.md` files
are installed-package usage guides for the reusable eXact agent skill, not instructions for
maintaining the package. Keep them brief enough to load without unnecessary context. They should:

- state when an application author should use the package;
- point to the package README for human-readable setup and API orientation;
- name only the safest, most idiomatic usage patterns and important application-facing limits;
- avoid implementation invariants, source-layout notes, test commands, release procedures, and
  instructions addressed to package maintainers.

Package `README.md` files are for human readers. Give them a consistent, professional progression:
identify the package and its purpose, explain when it is useful, show the shortest representative
setup or usage, summarize the important public surface, and link to deeper framework documentation
when needed. Keep them concise and scannable rather than turning them into exhaustive API or design
references. Adapt the sections to the package type: component libraries should show composition,
build adapters should show configuration, runtime libraries should show their main entry point,
and DevTools packages should explain how to install or operate the tools. Internal or
platform-binary packages may use a shorter purpose-and-ownership layout.

Update a package README or local agent guide when its public purpose, setup, recommended usage, or
application-facing limits change. Do not churn either file for an internal implementation change.
Every new package must begin with an appropriate README. Add a concise `AGENTS.md` when the
package exposes an application-authoring surface or the reusable skill otherwise needs
package-specific direction. Ensure published-package manifests include any local guide, and update
the reusable skill whenever a new application-authoring package should be discoverable.

## Preserve what makes eXact different

eXact is a compiler-led web framework, not a React dialect. Its TSX is intentionally familiar,
but its component, state, update, lifecycle, and server models have different goals. Do not
mechanically translate React architecture into native eXact code.

### Fix problems at their source

This repository is centered on the eXact framework. Its apps, adapters, plugins, component
libraries, examples, and tooling exist to facilitate and validate use of the framework.

When one of those projects exposes a bug or limitation, determine whether responsibility belongs
to the project or to the framework before changing code. Trace the failing behavior through the
compiler and runtime contracts when necessary. If the project is using a supported framework
feature correctly, fix the underlying framework defect and add regression coverage at the
appropriate framework boundary. Do not silence diagnostics, duplicate framework behavior, reshape
otherwise valid application code, or introduce project-local workarounds merely to make the
immediate failure disappear.

A project-level fix is appropriate when the project violates a framework contract, has
project-specific requirements, or contains an ordinary application bug. Make that ownership
decision explicit in the reasoning for the change.

### Component and update model

React function components execute again to describe the interface after an update. Hooks associate
state and effects with those executions through a stable call order, and React reconciles the new
description with the previous one.

An eXact component is a long-lived, inspectable component instance:

- The outer component function is a compiler-analyzed definition, not a linearly executed setup
  callback. It supplies state defaults, task definitions, reactive relationships, and preparation
  of the returned render function. The compiler turns that description into a reactive state
  machine, and each mounted component owns one durable instance of it.
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

### Tasks, interactions, and optimistic state

Keep ordinary event and form callbacks when inferred interaction ownership is sufficient. Define a
function task with a `TaskContext` policy parameter when work needs a name, inspectable status,
direct invocation, an explicit placement or priority, a concurrency policy, or synchronous
optimistic state. Function-defined tasks are setup-owned component resources; define them during
setup and invoke them normally.

Optimistic work mutates `this.state` normally inside the task context's synchronous
`optimistic()` callback. Do not introduce reducers, authored patches, shadow stores, or manual
rollback to imitate another framework. Router work begun synchronously by an event, form, or task
joins that interaction. Preserve opaque compiler operation identities and generation fencing
across distributed tasks.

### Finite component registries

Use `createComponentRegistry()` for dynamic selection from a finite set of native eXact
components. Keep the registry in a named module-level `const`, use its scoped `lazy()` capability,
derive keys with `KeyOf`, and narrow untrusted strings with `hasComponent()`. Do not mutate a
registry, cast arbitrary strings into keys, build an application-local loader table, or treat
authored names as protocol identity.

Registry keys own component identity and lifecycle. Preserve same-key instances, replace
different-key ranges, fence stale lazy candidates, and carry compiler-owned registry identity
through SSR and hydration. React-owned values still cross the explicit compatibility boundary
when ownership is not compiler-branded.

### JSX is source syntax, not the runtime architecture

Familiar JSX should make eXact easy to read without importing React's semantics:

- Preserve expression-level reactivity instead of treating JSX as a request to rerender the whole
  component.
- Prefer eXact's compiler-supported bindings, event typing, list identity, tasks, and placement
  features when they remove real source ceremony.
- Attach an enhancement to an existing semantic intrinsic when it owns that element's complete
  content or behavior. Use the transparent `_` fragment only for a genuinely narrower range,
  several independently enhanced regions within one host, or when no appropriate host exists.
- Use ordinary spaces in JSX prose. eXact applies HTML-like whitespace collapsing across multiline
  text, elements, and expressions, so do not insert `{' '}` merely to separate children. Use an
  explicit string expression only when the exact whitespace is dynamic or intentionally significant.
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
TypeScript and TSX, durable inspectable component state machines, precise reactive work, deterministic
ownership and cleanup, and understandable automatic client/server coordination. A design that
requires repeated component execution, hides state behind a runtime dispatcher, or adds
React-derived ceremony should have a specific eXact reason rather than familiarity as its
justification.

## Run platform-boundary checks outside the Windows sandbox

`npm.cmd run check:platform-boundaries` uses esbuild's JavaScript API to launch its native helper
and bundle built package entry points. Under the Codex restricted Windows sandbox, that child
process cannot enumerate the workspace and reports `Cannot read directory "../..": Access is
denied`, usually followed by misleading `Could not resolve .../dist/index.js` errors even when the
files exist. Ensure the workspace has been built, then request sandbox escalation for this check
instead of treating those messages as missing artifacts or changing package resolution to work
around them.

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
