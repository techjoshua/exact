# Sample applications

The repository's native applications exercise eXact as complete products rather than isolated API
examples. They use durable component instances, direct observable state, precise compiler-owned
updates, and the framework's normal build and runtime adapters.

## Hosted applications

[`apps/sudoku`](../apps/sudoku) is an installable interactive Sudoku game with persistence,
responsive controls, theming, clock-derived elapsed-time updates, and optional gesture and motion
enhancements. Its timer uses ordinary TypeScript formatting over an absolute anchor while the shared
`time:update` scheduler publishes second boundaries; it persists accumulated duration at game or
page-lifecycle boundaries instead of on display ticks. It is published with the documentation site
at `sudoku.html`.

The documentation application's **Sample applications** page is the directory for every hosted
application. The Enhancement Playground and Theme Lab, Kanban, Project Workbench, and Intl Testbed
are published under `enhancements/`, `kanban/`, `workbench/`, and `intl/`. The Pages assembly also
deploys Puzzle Foundry as an intentionally unadvertised `puzzle-foundry.html` artifact; neither the
documentation application nor Puzzle Foundry links to it or from it. Its themed authoring shell
keeps printable artwork and publication colors as explicit document data. Advertised hosted
applications link back with a GitHub Pages-relative URL to the documentation page for the framework
behavior they demonstrate.

## Repository examples

- [`apps/shipping-calculator`](../apps/shipping-calculator) demonstrates native SSR, hydration,
  client islands, server continuations, and a production-shaped server.
- [`apps/kanban`](../apps/kanban) exercises direct state mutation, keyed list identity, forms, and
  focused updates as cards move between columns.
- [`apps/workbench`](../apps/workbench) composes a denser stateful workspace from derived values,
  tasks, forms, and component-owned tools.
- [`apps/microfrontend-portal`](../apps/microfrontend-portal) exercises trusted microfrontend
  composition, shared capabilities, and independently built runtime boundaries.
- [`apps/server-components`](../apps/server-components) focuses on component placement, trusted
  server resources, generated artifacts, and public data crossing the client/server boundary.
- [`apps/intl-testbed`](../apps/intl-testbed) renders one enhancement-authored scenario in English,
  French, Japanese, and Arabic to exercise catalogs, structural reordering, formatting, and
  diagnostics. Semantic theme enhancements own its application chrome while fixed fragment colors
  remain part of the translation-reordering legend.

The documentation application links to every advertised hosted application. Shipping Calculator,
Microfrontend Portal, and Server Components remain local repository examples because they require
server or multi-runtime infrastructure that GitHub Pages cannot provide.
