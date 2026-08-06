# Sample applications

The repository's native applications exercise eXact as complete products rather than isolated API
examples. They use setup-once components, direct observable state, compiler-owned fine-grained
updates, and the framework's normal build adapters.

## Puzzle Foundry

[`apps/puzzle-generator`](../apps/puzzle-generator) is a browser-local publishing tool for Sudoku,
word-search, and crossword puzzles. Its algorithms are deterministic from a visible seed and its
generated puzzle and solution are independent SVG documents. Shared title, typography, color, and
line settings are rendered into both files.

The standalone build is intentionally one HTML file:

```sh
npm run build:puzzle-generator:standalone
```

`apps/puzzle-generator/dist/puzzle-foundry.html` has no external scripts, stylesheets, fonts,
images, or network services. Word input never leaves the browser. Word-search generation validates
dimensions and blocked sequences; crossword generation reports disconnected words rather than
claiming they were placed.

## Other complete samples

- [`apps/sudoku`](../apps/sudoku) is an installable, interactive Sudoku game with persistence,
  optional enhancements, and a standalone build.
- [`apps/shipping-calculator`](../apps/shipping-calculator) demonstrates native SSR, hydration,
  client islands, server continuations, and a production-shaped server.
- [`apps/kanban`](../apps/kanban) and [`apps/workbench`](../apps/workbench) demonstrate stateful
  application interfaces and compiler-led updates.
- [`apps/microfrontend-portal`](../apps/microfrontend-portal) exercises trusted microfrontend
  composition.
- [`apps/server-components`](../apps/server-components) focuses on server component placement and
  generated artifacts.
