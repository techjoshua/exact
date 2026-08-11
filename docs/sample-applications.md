# Sample applications

The repository's native applications exercise eXact as complete products rather than isolated API
examples. They use durable component instances, direct observable state, precise compiler-owned
updates, and the framework's normal build and runtime adapters.

## Hosted demo

[`apps/sudoku`](../apps/sudoku) is an installable interactive Sudoku game with persistence,
responsive controls, theming, and optional gesture and motion enhancements. It is the only sample
published with the documentation site, at `sudoku.html`.

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
  diagnostics.

Only Sudoku Atelier is hosted on GitHub Pages. The remaining applications are local repository
examples and should not be presented as navigable documentation routes.
