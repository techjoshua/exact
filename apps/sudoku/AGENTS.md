# Maintaining Sudoku Atelier

Keep the game as one durable `SudokuApp` instance with directly inspectable state. Put pure puzzle
rules and move planning in the game engine; keep input commands, history, preferences, and owned
browser resources in the component.

Keep board-wide derived values in component setup when all cells share them, and keep cell-only
presentation calculations directly in their JSX binding. Do not move either calculation into an
imperative cache or a render-local declaration that makes the whole component observe it.

Timer and persistence calls are reactive client task activations. Their changing arguments define
dependencies and reactive activation already supersedes the prior generation. Leave
compiler-known intervals local to the task expression, and use task abort signals for browser
listeners. Do not store timer handles in component state or recreate React-style effect cleanup.

Run `npm run test:sudoku` and `npm run build:sudoku` after component changes.
