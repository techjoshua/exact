# eXact Sudoku Sample

An eXact Sudoku application used to exercise compiler-backed TSX, fine-grained reactive updates,
keyboard and pointer input, and standalone browser builds.

## Run

From the repository root:

```sh
npm run dev:sudoku
npm run build:sudoku
```

The app can also produce its self-contained distribution through the `build:standalone` workspace
script. Its tests cover the puzzle model and user-facing game behavior.
