# Sample applications

The repository's native applications exercise eXact as complete products rather than isolated API
examples. They use durable component instances, direct observable state, precise compiler-owned
updates, and the framework's normal build and runtime adapters.

## Hosted applications

[`apps/sudoku`](../apps/sudoku) is an installable interactive Sudoku game with persistence,
responsive controls, theming, and optional gesture and motion enhancements. It is published with
the documentation site at `sudoku.html`.

The Enhancement Playground and Theme Lab, Kanban, Project Workbench, and Intl Testbed are also
published with the documentation site under `enhancements/`, `kanban/`, `workbench/`, and `intl/`.

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

The documentation application links to every hosted application. Shipping Calculator,
Microfrontend Portal, and Server Components remain local repository examples because they require
server or multi-runtime infrastructure that GitHub Pages cannot provide.
