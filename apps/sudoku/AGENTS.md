# Maintaining Sudoku Atelier

Keep the game as one durable `SudokuApp` instance with directly inspectable state. Put pure puzzle
rules and move planning in the game engine; keep input commands, history, preferences, and owned
browser resources in the component.

Keep board-wide derived values in component setup when all cells share them, and keep cell-only
presentation calculations directly in their JSX binding. Do not move either calculation into an
imperative cache or a render-local declaration that makes the whole component observe it.
Keep board-wide rule derivation linear in the fixed cell count. In particular, detect conflicts
through row, column, and box digit indexes rather than comparing each filled cell with every peer;
the move path must not become progressively more expensive as the board fills.

Timer and persistence calls are reactive task activations. Their changing arguments define
dependencies, reactive activation already supersedes the prior generation, and known timer,
storage, and DOM APIs let the compiler infer client placement. Leave compiler-known intervals and
listeners local to the task expression so the compiler injects cancellation; do not author task
signals, store timer handles in component state, or recreate React-style effect cleanup.

Run `npm run test:sudoku` and `npm run build:sudoku` after component changes.
