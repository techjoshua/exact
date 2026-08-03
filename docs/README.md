# Repository documentation

The `docs` directory contains engineering documentation for the current eXact
repository. It is organized by authority so that an old implementation plan
cannot be mistaken for a current framework contract.

## Current references

These documents describe behavior that exists in the repository today:

| Document                                                                         | Subject                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [actions-and-forms.md](actions-and-forms.md)                                     | Task interactions, optimism, forms, and router coordination.                     |
| [code-maintainability.md](code-maintainability.md)                               | Required source, ownership, JSDoc, and testing standards.                        |
| [component-language.md](component-language.md)                                   | Complete native component and TSX authoring reference.                           |
| [component-registries.md](component-registries.md)                               | Finite eager/lazy component selection, identity, SSR, and hydration.             |
| [distributed-component-continuations.md](distributed-component-continuations.md) | Compiler-distributed client/server component state machines.                     |
| [devtools.md](devtools.md)                                                       | Authorized browser/server inspection, federation, redaction, and agents.         |
| [framework-plugins.md](framework-plugins.md)                                     | Plugin discovery, configuration, projections, and lifecycle.                     |
| [gestures.md](gestures.md)                                                       | Prepared gesture recognition, ownership, accessibility, and testing.             |
| [gravity.md](gravity.md)                                                         | Pure acceleration fields and physics force registration.                         |
| [instrumentation.md](instrumentation.md)                                         | Optional profiling contracts and event collection.                               |
| [jsx-cells.md](jsx-cells.md)                                                     | Internal reactive JSX cell and mounted-range model.                              |
| [language-tools.md](language-tools.md)                                           | Compiler inspection, LSP, VS Code, diagnostics, and safe task refactors.         |
| [microfrontends.md](microfrontends.md)                                           | Implemented trusted microfrontend scope and remaining adapter work.              |
| [motion.md](motion.md)                                                           | Prepared motion definitions, finite playback, configuration, and current limits. |
| [native-compiler.md](native-compiler.md)                                         | Native compiler architecture, distribution, sessions, and release checks.        |
| [native-ssr-production-guide.md](native-ssr-production-guide.md)                 | Production SSR, request, response, security, and deployment contracts.           |
| [physics.md](physics.md)                                                         | Deterministic simulation, component ownership, and safe DOM projection.          |
| [react-compatibility.md](react-compatibility.md)                                 | React 18/19 compatibility surface and explicit fidelity limits.                  |
| [react-ecosystem-adapters.md](react-ecosystem-adapters.md)                       | Native substitutions for selected React-owned packages.                          |
| [react-router-compatibility.md](react-router-compatibility.md)                   | Implemented React Router 5/6/7 facade coverage.                                  |
| [scheduling-suspense-activity.md](scheduling-suspense-activity.md)               | Native scheduling, readiness, retained DOM, and async-component semantics.       |
| [server-components.md](server-components.md)                                     | Authoring and operating server-executed component work.                          |
| [server-context-and-data-policy.md](server-context-and-data-policy.md)           | Context lifetime, placement, residency, sharing, and secret boundaries.          |
| [ssr-hydration.md](ssr-hydration.md)                                             | Current SSR, streaming, hydration, and patch capabilities.                       |
| [tasks.md](tasks.md)                                                             | Function-defined tasks, structured lifetime, policy, status, and task ABI.       |

The public learning guide is the eXact docs application under
[`apps/docs`](../apps/docs). Package-level API entry points live in the
`README.md` belonging to each package.

## Proposals

[`proposals`](proposals) contains active designs and exploratory work. Neither
is current framework behavior or a release commitment. Code and the current
references above remain authoritative.

Active proposals, in dependency order:

| Proposal                                                                                              | Status   | Scope                                                                                     |
| ----------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| [Recursive server/client graph partitioning](proposals/recursive-server-client-graph-partitioning.md) | Accepted | Preserve maximal same-placement regions across alternating client and server descendants. |
| [Broader lazy interaction-island eligibility](proposals/lazy-interaction-islands.md)                  | Proposed | Defer more statically safe client regions without replaying continuous event streams.     |
| [Compiler-planned structural refresh](proposals/compiler-planned-structural-refresh.md)               | Proposed | Emit source-informed refresh plans while retaining validated boundary replacement.        |
| [Serializable partial-prerender resumption](proposals/partial-prerender-resumption.md)                | Proposed | Persist authenticated postponed renderer/task state and resume it in a later request.     |
| [Webpack and Bun microfrontend production parity](proposals/webpack-bun-microfrontend-parity.md)      | Proposed | Complete adapter lifecycle and heterogeneous conformance over the shared artifact model.  |

Exploratory work:

| Document                                                                                       | Scope                                                                                        |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Candidate future work](proposals/future-work.md)                                              | Uncommitted framework, integration, sample, and optimization candidates.                     |
| [JavaScript runtime object-layout optimization](proposals/javascript-runtime-object-layout.md) | Initial measurements and acceptance gates for a production-shaped runtime-layout experiment. |

Delivered proposals are removed after their current contracts and remaining limitations are captured
by the references above. Git history retains their original delivery rationale.

## Historical evidence

[`history`](history) contains dated benchmark and adversarial-review records.
They explain why decisions were made but are not current API documentation.
Every historical record identifies its measurement or review baseline.

The current repository-wide implementation review is recorded in
[`history/repository-code-review-2026-07.md`](history/repository-code-review-2026-07.md).

## Maintenance rule

When implementation lands, update the relevant current reference and either
remove its completed plan or reduce the plan to unresolved follow-up work.
Do not leave a completed `*-plan.md` beside the implementation as though both
were normative. Git history is the archive for discarded delivery detail.
