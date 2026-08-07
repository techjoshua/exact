# Sample applications

The repository's native applications exercise eXact as complete products rather than isolated API
examples. They use setup-once components, direct observable state, compiler-owned fine-grained
updates, and the framework's normal build adapters.

## Puzzle Foundry

[`apps/puzzle-generator`](../apps/puzzle-generator) is a browser-local publishing tool for Sudoku,
word-search, and crossword puzzles. Its algorithms are deterministic from a visible seed and its
generated puzzle and solution are independent fixed-page SVG documents. Titles, puzzle grids, and
word-list or crossword-clue sections have independent typography and expanded size ranges. US
Letter is the non-empty default; Letter, A4, and Legal presets can be replaced by a custom width and
height. Margin presets likewise support a custom uniform value. Content is scaled into that
printable region with a visible warning when necessary, while invalid custom dimensions surface an
error and retain the last valid preview. Crossword input
uses `answer - clue` lines and produces numbered Across and Down clue tables. Its grid lines, unused
cells, and letter-cell background are separately styled; the letter-cell background does not color
the page. Answer keys support color or puzzle-specific black-and-white rendering. Sudoku answer
digits may use their own portable font stack and weight.

The standalone build is intentionally one HTML file:

```sh
npm run build:puzzle-generator:standalone
```

`apps/puzzle-generator/dist/puzzle-foundry.html` has no external scripts, stylesheets, fonts,
images, or network services for its non-AI features. Word input never leaves the browser. Controls
regenerate on change, while Shuffle deliberately chooses a new seed. Word-search generation
validates dimensions and blocked sequences; visible errors preserve the last valid preview, and
crossword generation reports disconnected words rather than claiming they were placed.

Word searches and crosswords also expose an explicit local-AI opt-in. On demand, the app and its
module worker load the pinned WebLLM 0.2.84 runtime from jsDelivr's `esm.run` endpoint rather than
bundling it. Authors can choose among 10 curated chat/instruct models whose downloads remain below
1.5 GiB. The selector reports approximate download and GPU-memory costs; browser-tested Llama 3.2
1B is the 672 MB default. Gemma 3 1B is excluded while WebLLM's upstream sliding-window correctness
issue remains unresolved. The browser reports download progress and caches each model separately.
Inference stays on the user's WebGPU device; topics and generated puzzle material are not uploaded.
Generated JSON is normalized and safety-checked through the ordinary word-input boundary. A
post-download control can remove the selected cached model, and unsupported devices retain the
complete manual workflow.

Each word-based puzzle owns an editable local-AI prompt template. Authors can reveal it with **Show
prompt**, use `{{topic}}` to place the topic, and restore the shipped version with **Reset template**.
The default prompts request pools of 20 items. The crossword template requires short conventional
clues, direct topic relevance, and an accurate answer/clue pairing instead of self-referential
definitions. Both templates explicitly describe their sole top-level JSON property, array shape,
item count, allowed properties, and JSON-only response boundary. They describe the required opening,
item, separator, and closing syntax without sample values that a small model might copy.
Puzzle-specific system instructions and
lower-randomness structured generation further reduce format drift. Deterministic validation rejects
generated clues that contain their answer or a longer form containing it, along with common scaffold
placeholders. One automatic repair pass gives the local model the rejected output and exact leaks
before the helper reports a failure. The response inspector retains the raw initial and repair
completions before parsing, shows each finish reason, and identifies output-limit truncation, so
malformed output remains visible to the author.

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
