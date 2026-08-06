# eXact Puzzle Foundry sample

A browser-local puzzle publishing app built with native eXact components. It creates uniquely
solvable 4×4 and 9×9 Sudoku puzzles, rectangular word searches, and compact connected crosswords.
Every generator is deterministic from a visible seed. Puzzle and solution artwork use the same
typography and page settings but export as separate SVG files. Titles are optional and align left,
center, or right. Portable system-font choices include serif, sans, mono, handwritten print, and
playful rounded styles.

## Run locally

```sh
npm run dev:puzzle-generator
```

Word-search input is normalized and checked before placement. Hard searches add near-match decoys,
and generated rows, columns, and diagonals are regenerated when they contain a conservative list of
blocked sequences. Crossword generation tries several connected layouts and reports words that
cannot be joined instead of silently presenting them as placed. Crossword grid lines and unused
backgrounds have independent colors, and the word bank is optional. Answer keys can retain the
accent color or use puzzle-specific black-and-white rendering; Sudoku answer digits may also use a
different font or weight.

## Build one portable file

```sh
npm run build:puzzle-generator:standalone
```

The result is `apps/puzzle-generator/dist/puzzle-foundry.html`. It contains the application,
styles, compiler output, and framework runtime with no external script, stylesheet, font, image, or
network dependency. SVG downloads are created locally and work when the HTML file is opened from
disk.
