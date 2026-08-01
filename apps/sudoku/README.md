# eXact Sudoku sample

An installable Sudoku game demonstrating compiler-backed TSX, fine-grained grid updates, keyboard
and pointer input, local persistence, and offline standalone builds.

## Run locally

```sh
npm run dev:sudoku
```

Games are generated locally from reproducible seeds and retain a unique solution. The interface
supports notes, undo and redo, conflict highlighting, number-placement progress, themes, and
responsive controls.

## Build

```sh
npm run build:sudoku
```

The standalone build includes the application shell and PWA companion files for offline play after
the first successful installation.
