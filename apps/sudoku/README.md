# eXact Sudoku sample

An installable Sudoku game demonstrating compiler-backed TSX, fine-grained grid updates, keyboard
and pointer input, local persistence, optional attributed motion enhancements, and offline
standalone builds. Theme, pause, victory, and inspector elements remain ordinary functional JSX;
when the motion capability is bundled they gain preset or reactive transitions, and when it is
excluded they fall back to their authored states without replacement components. The portrait
controls use the same progressive-enhancement model for long-press erase: ordinary tap and keyboard
controls remain functional when the gestures capability is omitted.

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
