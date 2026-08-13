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
responsive controls. Typing a digit enters it directly into the selected cell, while typing after
the board selection is released selects that digit on the number pad. Selecting a number enables
click-to-enter; selecting it again clears both the number and cell selection. Mouse users can
right-click an editable cell to toggle a pencil mark for the selected number. Each board cell
retains stable value and nine-slot pencil-mark DOM layers, while board-root CSS state controls their
visibility and matching-number highlights. Solving a puzzle stops its clock and includes the final
elapsed time in the victory message.

## Build

```sh
npm run build:sudoku
```

The standalone build includes the application shell and PWA companion files for offline play after
the first successful installation.
