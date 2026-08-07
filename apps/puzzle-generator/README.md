# eXact Puzzle Foundry sample

A browser-local puzzle publishing app built with native eXact components. It creates uniquely
solvable 4×4 and 9×9 Sudoku puzzles, rectangular word searches, and compact connected crosswords.
Every generator is deterministic from a visible seed. Puzzle and solution artwork use the same
print settings but export as separate SVG files. Titles are optional, align left, center, or right,
and have font and size controls independent from puzzle content. Letter, A4, and Legal page sizes
use configurable print margins; the preview scales the resulting fixed-size page to the screen.

## Run locally

```sh
npm run dev:puzzle-generator
```

Every input change regenerates the current puzzle; **Shuffle** changes its seed. Word-search input
is normalized and checked before placement. Hard searches add near-match decoys, and generated
rows, columns, and diagonals are regenerated when they contain a conservative list of blocked
sequences. Crossword entries use one human-readable `answer - clue` line apiece. Generation creates
numbered Across and Down clue tables and reports words that cannot be joined. Crossword grid lines,
unused cells, and letter-cell backgrounds have independent colors. Invalid inputs remain visible as
errors, while page-fit scaling and disconnected crossword entries are reported as warnings. Answer
keys can retain the accent color or use puzzle-specific black-and-white rendering; Sudoku answer
digits may also use a different font or weight.

## Optional local AI

Word searches and crosswords include an opt-in topic helper powered by WebLLM and the quantized
`Qwen2.5-0.5B-Instruct` model. After the user opts in, the browser loads the pinned WebLLM 0.2.84
runtime from jsDelivr's `esm.run` endpoint and downloads roughly 290 MB of model artifacts from the
MLC repository on Hugging Face. Inference requires about 1 GB of GPU memory and runs locally in a
module Web Worker; topics, generated words, and clues are not uploaded. The browser caches the model
artifacts, while the runtime remains a CDN dependency for each uncached session. Unsupported
browsers keep the ordinary manual authoring workflow and explain that WebGPU is unavailable. Model
output is constrained to JSON, normalized, deduplicated, and passed through the same safety
validation as authored words before it can replace the editable list. After the model is ready, the
helper also offers a control that removes its cached artifacts.

## Build one portable file

```sh
npm run build:puzzle-generator:standalone
```

The result is `apps/puzzle-generator/dist/puzzle-foundry.html`. It contains the application,
styles, compiler output, framework runtime, and local-AI controller with no external script,
stylesheet, font, or image dependency for non-AI features. SVG downloads and all non-AI features
work when the HTML file is opened from disk. Optional AI requires HTTPS or localhost for WebGPU and
network access to load its pinned WebLLM runtime from jsDelivr. Its first use also downloads the
model; cached model inference remains local afterward.
