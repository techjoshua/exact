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
script. New games are generated locally from storage-safe seeds, remain reproducible across saved
sessions, and retain a unique solution. The number pad visualizes each digit's placement progress,
marks locally conflicting digits, and highlights nine non-conflicting placements without revealing
whether player entries match the solution. Mobile layouts expose new-game controls both during play
and after a win. Tests cover the puzzle generator, puzzle model, and user-facing game behavior.

The game timer, persistence, keyboard input, and page-lifetime listeners are
component-owned client tasks. Reactive timer and persistence activations use
their inherent superseding behavior; compiler-known intervals remain local so
the generated task generation owns cancellation and cleanup.

Board-wide relationships such as the selected value stay setup-derived so every cell shares one
cached result. Cell-only presentation calculations remain directly in their compiled binding,
avoiding redundant component render subscriptions during a move.

Both production formats are installable progressive web apps. Their service worker precaches the
application shell, manifest, icons, and generated code so saved and newly generated games remain
playable offline after the first successful installation. The GitHub Pages build keeps its app
code inside `sudoku.html` and publishes the small PWA companion files beside it.

The repository's `Publish Pages apps` workflow rebuilds that distribution after every push to
`main`, including merged pull requests, and publishes it beside the standalone documentation on
the `gh-pages` branch.
