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
| [component-library-trust.md](component-library-trust.md)                         | Bundler-enforced server component package authorization.                         |
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
| [performance.md](performance.md)                                                 | Opt-in JavaScript performance suite, measurement contract, and tracked baseline. |
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

The proposal program is executed through the following gates. A later stage may be investigated,
but it is not finalized or advertised until every earlier completion gate is satisfied. When a
performance experiment succeeds, either implement it under an already decision-complete proposal
or create and insert a focused proposal before any dependent stage; when it fails, record the
rejection and continue. “Resolve” therefore means an explicit accept-or-reject decision, not an
indefinite exploratory pause.

| Stage | Work                                                                                                | Completion gate                                                                                                                          |
| ----: | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | [Recursive server/client graph partitioning](history/recursive-server-client-graph-partitioning.md) | **Completed and archived:** retain as the protocol and ownership baseline.                                                               |
|     1 | [JavaScript performance measurement baseline](proposals/javascript-performance-improvements.md)     | **Completed:** compiled DOM gate plus production-shaped client, server, network, heap, Chromium, and build baselines.                    |
|     2 | [Separate enhancements from framework plugins](history/enhancements-as-component-composition.md)    | **Completed and archived:** enhancement terminology, activator grouping, `_`, `_target`, bounded routing, ownership, and metadata.       |
|     3 | [Bundler-enforced server component-library trust](history/server-component-library-trust.md)        | **Completed and archived:** authorize resolved server-executing component graphs without adding compiler policy.                         |
|     4 | [Component value/callback binding shorthand](history/component-value-callback-bindings.md)          | **Completed and archived:** finite component pairs, canonical intrinsic endpoints, details adoption, and language tooling.               |
|     5 | [Cooperative structured children](proposals/cooperative-structured-children.md)                     | **Deferred prerequisite:** no implementation work is scheduled; it must be accepted and implemented before stage 6 can resume.           |
|     6 | [Enhancement-first internationalization](proposals/enhancement-first-internationalization.md)       | **Deferred dependent stage:** do not finalize or implement until stage 5 supplies its accepted framework contract.                       |
|     7 | [Dependent performance foundations](proposals/javascript-performance-improvements.md)               | Resolve render-plan, deterministic async SSR, compact hydration/progressive publication, and transport/build-host experiments 2–4 and 6. |
|     8 | [Broader lazy interaction-island eligibility](proposals/lazy-interaction-islands.md)                | Implement deferred ownership, replay, capability splitting, hydration, and diagnostics over the settled contracts.                       |
|     9 | [Compiler-planned structural refresh](proposals/compiler-planned-structural-refresh.md)             | Implement typed structural plans using the settled render-slot, activation, and fallback contracts.                                      |
|    10 | [Serializable partial-prerender resumption](proposals/partial-prerender-resumption.md)              | Implement authenticated reconstruction using settled structural plans, SSR ownership, and streaming contracts.                           |
|    11 | [Webpack and Bun microfrontend production parity](proposals/webpack-bun-microfrontend-parity.md)    | Complete heterogeneous adapter conformance over all preceding artifact, trust, locale, activation, refresh, and resumption contracts.    |
|    12 | [Remaining JavaScript performance experiments](proposals/javascript-performance-improvements.md)    | Resolve experiments 5 and 7–13, land or separately propose successful work, rerun whole-framework profiles, and record rejected options. |

The active and gated documents are:

| Proposal                                                                                         | Status   | Scope                                                                                                                |
| ------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| [JavaScript performance improvements](proposals/javascript-performance-improvements.md)          | Gated    | Establish baselines, resolve dependent foundations, and complete the remaining measured optimization program.        |
| [Cooperative structured children](proposals/cooperative-structured-children.md)                  | Deferred | Prerequisite for nested cooperative message composition; no prototype or implementation work is currently scheduled. |
| [Enhancement-first internationalization](proposals/enhancement-first-internationalization.md)    | Deferred | Depends on an accepted and implemented cooperative-children contract before finalization or implementation.          |
| [Broader lazy interaction-island eligibility](proposals/lazy-interaction-islands.md)             | Ready    | Defer more statically safe client regions with compiler-proven ownership and replay.                                 |
| [Compiler-planned structural refresh](proposals/compiler-planned-structural-refresh.md)          | Proposed | Emit source-informed refresh plans while retaining validated boundary replacement.                                   |
| [Serializable partial-prerender resumption](proposals/partial-prerender-resumption.md)           | Proposed | Persist authenticated postponed renderer/task state and resume it in a later request.                                |
| [Webpack and Bun microfrontend production parity](proposals/webpack-bun-microfrontend-parity.md) | Proposed | Complete adapter lifecycle and heterogeneous conformance over the shared artifact model.                             |

Other exploratory work that is not part of the sequential program until promoted into a focused
proposal:

| Document                                          | Scope                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| [Candidate future work](proposals/future-work.md) | Uncommitted framework, integration, sample, and optimization candidates. |

Delivered proposals move to [`history`](history) after their current contracts and remaining
limitations are captured by the references above. The archive preserves their delivery rationale
without presenting completed plans as active work.

## Historical evidence

[`history`](history) contains completed proposal records plus dated benchmark and adversarial-review
records. They explain why decisions were made but are not current API documentation. Every
historical record identifies its implemented contract, measurement baseline, or review baseline.

Completed proposal records:

| Proposal                                                                                            | Delivered contract                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Recursive server/client graph partitioning](history/recursive-server-client-graph-partitioning.md) | Maximal same-placement regions across alternating client and server descendants.                                                    |
| [Enhancements as component composition](history/enhancements-as-component-composition.md)           | Ordinary component-library enhancements, finite activators, direct `_`, semantic `_target`, bounded routing, and portable metadata. |
| [Bundler-enforced server component-library trust](history/server-component-library-trust.md)        | Resolver-proven server component authorization, inert package facts, atomic development generations, and paired fingerprints.       |
| [Component value/callback binding shorthand](history/component-value-callback-bindings.md)          | Finite controlled-component pairs, canonical intrinsic endpoints, details hydration adoption, and binding-aware language tooling.   |

The current repository-wide implementation review is recorded in
[`history/repository-code-review-2026-07.md`](history/repository-code-review-2026-07.md).

## Maintenance rule

When implementation lands, update the relevant current reference and either move the completed
proposal to `history` or reduce it to unresolved follow-up work. Do not leave a completed plan in
`proposals` beside the implementation as though both were normative. Historical proposal records
must identify their delivered status and defer to current references for normative behavior.
