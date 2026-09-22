# Repository documentation

The `docs` directory contains engineering documentation for the current eXact
repository. It is organized by authority so that an old implementation plan
cannot be mistaken for a current framework contract.

Start with the [public learning guide](../apps/docs/README.md) when building an application.
Package READMEs introduce installation and API usage. The references below are for contributors
and developers who need detailed framework contracts.

## Current references

These documents describe behavior that exists in the repository today:

| Document                                                                         | Subject                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [actions-and-forms.md](actions-and-forms.md)                                     | Task interactions, optimism, forms, and router coordination.                                              |
| [accessibility.md](accessibility.md)                                             | Native-first accessibility enhancements, modal binding, relationships, navigation, and diagnostics.       |
| [compiled-component-artifacts.md](compiled-component-artifacts.md)               | Compiled client/server artifacts, ABI boundaries, and compatibility.                                      |
| [licensing.md](licensing.md)                                                     | Copyright, Apache-2.0, and distribution attribution.                                                      |
| [release-readiness.md](release-readiness.md)                                     | Independent versions, npm packaging, publication, and ABI release checks.                                 |
| [core-api-ownership.md](core-api-ownership.md)                                   | Application APIs and framework integration boundaries.                                                    |
| [code-maintainability.md](code-maintainability.md)                               | Required source, ownership, JSDoc, and testing standards.                                                 |
| [component-language.md](component-language.md)                                   | Complete native component and TSX authoring reference.                                                    |
| [child-composition.md](child-composition.md)                                     | Immediate-child composition and customizable document shells.                                             |
| [component-composition-corpus.md](component-composition-corpus.md)               | Normative compiler-path and cross-renderer component acceptance corpus.                                   |
| [component-library-trust.md](component-library-trust.md)                         | Bundler-enforced server component package authorization.                                                  |
| [component-registries.md](component-registries.md)                               | Branched, finite-registry, and open dynamic component selection.                                          |
| [charts.md](charts.md)                                                           | Accessible native chart components, compact data, intl, theme, interaction, and SSR.                      |
| [distributed-component-continuations.md](distributed-component-continuations.md) | Compiler-distributed client/server component state machines.                                              |
| [devtools.md](devtools.md)                                                       | Authorized browser/server inspection, federation, redaction, and agents.                                  |
| [exact-for-react-developers.md](exact-for-react-developers.md)                   | Side-by-side native eXact and idiomatic React component authoring guide.                                  |
| [framework-plugins.md](framework-plugins.md)                                     | Plugin discovery, configuration, projections, and lifecycle.                                              |
| [framework-comparison.md](framework-comparison.md)                               | Cross-framework application contract, comparison tracks, fairness, and current suite status.              |
| [gestures.md](gestures.md)                                                       | Prepared gesture recognition, ownership, accessibility, and testing.                                      |
| [gravity.md](gravity.md)                                                         | Pure acceleration fields and physics force registration.                                                  |
| [instrumentation.md](instrumentation.md)                                         | Optional profiling contracts and event collection.                                                        |
| [internationalization.md](internationalization.md)                               | Native intl analysis, source-message extraction, XLIFF catalogs, runtime, and shared bundler integration. |
| [date-time.md](date-time.md)                                                     | Reactive clock-derived views, automatic boundaries, shared scheduling, clocks, and Intl composition.      |
| [jsx-cells.md](jsx-cells.md)                                                     | Internal reactive JSX cell and mounted-range model.                                                       |
| [language-tools.md](language-tools.md)                                           | Compiler inspection, LSP, VS Code, diagnostics, and safe task refactors.                                  |
| [microfrontends.md](microfrontends.md)                                           | Implemented trusted microfrontend scope and remaining adapter work.                                       |
| [motion.md](motion.md)                                                           | Prepared motion definitions, finite playback, configuration, and current limits.                          |
| [native-compiler.md](native-compiler.md)                                         | Native compiler architecture, distribution, sessions, and release checks.                                 |
| [native-ssr-production-guide.md](native-ssr-production-guide.md)                 | Production SSR, request, response, security, and deployment contracts.                                    |
| [performance.md](performance.md)                                                 | Opt-in JavaScript performance suite, measurement contract, and tracked baseline.                          |
| [physics.md](physics.md)                                                         | Deterministic simulation, component ownership, and safe DOM projection.                                   |
| [react-compatibility.md](react-compatibility.md)                                 | React 18/19 compatibility surface and explicit fidelity limits.                                           |
| [react-ecosystem-adapters.md](react-ecosystem-adapters.md)                       | Native substitutions for selected React-owned packages.                                                   |
| [react-router-compatibility.md](react-router-compatibility.md)                   | Implemented React Router 5/6/7 facade coverage.                                                           |
| [sample-applications.md](sample-applications.md)                                 | Complete native applications and their build or runtime focus.                                            |
| [scheduling-suspense-activity.md](scheduling-suspense-activity.md)               | Native scheduling, readiness, retained DOM, and async-component semantics.                                |
| [server-components.md](server-components.md)                                     | Authoring and operating server-executed component work.                                                   |
| [server-context-and-data-policy.md](server-context-and-data-policy.md)           | Context lifetime, placement, residency, sharing, and secret boundaries.                                   |
| [ssr-hydration.md](ssr-hydration.md)                                             | Current SSR, streaming, hydration, and patch capabilities.                                                |
| [tasks.md](tasks.md)                                                             | Function-defined tasks, structured lifetime, policy, status, and task ABI.                                |
| [theme.md](theme.md)                                                             | Deterministic theme resolution, semantic enhancements, nested surfaces, CSS tokens, and derivation.       |

The public learning guide is the eXact docs application under
[`apps/docs`](../apps/docs). Package-level API entry points live in the
`README.md` belonging to each package.

## Contract details

- [Theme contract](theme-contract.md): exact tokens, formulas, validation, and conformance.
- [Language contribution protocol](language-contribution-protocol.md): package declarations,
  analyzer transport, trust, and lifecycle.
- [Provider facades](framework-plugins.md#generated-provider-facades-and-adapter-ownership): shared
  adapter resolution and generation ownership.
- [Sustained SSR load testing](ssr-load-testing.md): independent drivers and demand accounting.

## Proposed and deferred work

- [Thematic presentation providers](proposals/thematic-presentation-providers.md): proposed CSS-system integration.
- [Motion values and orchestration](proposals/exploratory-motion-values-and-orchestration.md): exploratory designs.
- [Future work](proposals/future-work.md): deferred questions and outstanding acceptance work.

These are not shipped APIs or release commitments. Implemented behavior belongs in the current
references above, not in a completed delivery plan.

## Selected findings

- [September performance findings](findings/2026-09-performance.md): measurement limits and decisions.
- [September correctness findings](findings/2026-09-correctness.md): durable lessons from completed audits.

Completed plans, detailed audits, and per-experiment reports remain recoverable from
[the pre-consolidation snapshot](https://github.com/techjoshua/exact/tree/e357267aebd4659e186efa30516fde8ed4890c18/docs).
Historical observations do not define current contracts. Do not create new archive copies when Git
already preserves the original.

Documentation maintenance rules live in the root [AGENTS.md](../AGENTS.md#keep-documentation-focused-and-consolidate-completed-work).
