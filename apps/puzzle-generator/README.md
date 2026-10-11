# eXact Puzzle Foundry sample

A browser-local puzzle publishing app built with native eXact components. It creates uniquely
solvable 4×4 and 9×9 Sudoku puzzles, rectangular word searches, and compact connected crosswords.
Every generator is deterministic from a visible seed. Puzzle and solution artwork use the same
print settings but export as separate SVG files. Titles are optional, align left, center, or right.
Titles, puzzle grids, and word-list or crossword-clue sections each have independent font and size
controls, with expanded type-size ranges. The three publishing presets are 8.5 × 11, 7 × 10, and
6 × 9 inches, joined by custom page width and height controls. Narrow, standard, and wide margin
presets can likewise be replaced with a custom uniform margin. The 8.5 × 11-inch format is always
the initial page. The preview scales the resulting fixed-size page to the screen. Printable
backgrounds start pure white. Crosswords have separate colors for letter cells, other unused cells,
and enclosed unused cells. Enclosed unused cells default to black so they cannot be mistaken for
answer spaces. An unused cell is enclosed only when its four immediate neighbors above, below,
left, and right contain letters. Groups of adjacent empty cells use the other unused-cell color.
These settings apply to both the puzzle and its solution.

## Run locally

```sh
npm run dev:puzzle-generator
```

Every input change regenerates the current puzzle. **Shuffle** changes its seed. Word-search input
is normalized and checked before placement. Hard searches add near-match decoys, and generated
rows, columns, and diagonals are regenerated when they contain a conservative list of blocked
sequences. Crossword entries use one human-readable `answer - clue` line apiece. Dash separators accept
spaces on either side or neither side, including en dashes and em dashes. A spaced separator
takes precedence so hyphenated answers such as `X-RAY - Imaging technique` remain usable.
Otherwise, the first dash separates the answer from its clue. Manual clues have no character limit.
Generation creates numbered Across and Down clue tables and reports words that cannot be joined. Enable **Answer
spaces before clues** in the Crossword clues settings to print prompts such as
`1. _____: Icy visitor with a tail` for COMET. Each space uses one underscore per letter in the
answer, and the clue number still identifies its grid position. This setting starts off and applies to
both puzzle and solution exports. Crossword grid lines,
unused cells, and letter-cell backgrounds have independent colors. Invalid inputs remain visible as
errors. Crossword answer-validation errors identify the original input line and its line number,
preserving spaces and punctuation. Page-fit scaling and disconnected crossword entries are reported
as warnings. Answer
keys can retain the accent color or use puzzle-specific black-and-white rendering. Sudoku answer
digits may also use a different font or weight.

## Optional local AI

Word searches and crosswords include an opt-in topic helper powered by WebLLM. Expand the
initially closed **Local AI helper** section to access it. Its selector offers
10 curated chat/instruct models with downloads below 1.5 GiB, including Llama 3.2 1B and several
Qwen and SmolLM sizes. It shows the approximate first-download and GPU-memory cost of the selected
model. The browser-tested Llama 3.2 1B is the default at about 672 MB downloaded and 879 MB of GPU
memory. Gemma 3 1B is deliberately excluded while WebLLM's upstream sliding-window correctness
issue remains unresolved. After the user opts in, the browser loads the pinned WebLLM 0.2.84 runtime
from jsDelivr's `esm.run` endpoint and downloads the selected artifacts from the MLC repository on
Hugging Face. Inference runs locally in a module Web Worker; topics, generated words, and clues are
not uploaded. Each model is cached separately, while the runtime remains a CDN dependency for each
uncached session. Unsupported browsers keep the ordinary manual authoring workflow and explain
that WebGPU is unavailable. Model output is constrained to JSON, normalized, deduplicated, and
passed through the same safety validation as authored words before it can replace the editable
list. After a model is ready, the helper also offers a control that removes its cached artifacts.

The helper's **Show prompt** control exposes a separate editable template for word searches and
crosswords. `{{topic}}` marks where the topic is inserted, and **Reset template** restores the
shipped prompt for the current puzzle kind. Both defaults request pools of 20 items. The crossword
template asks for short conventional clues, requires topic relevance and accurate answer/clue
pairing, and forbids answer variants in clues. Both templates spell out the required top-level JSON
property, item count, property names, prohibition on prose or Markdown fences, and required opening,
item, separator, and closing syntax without giving the model sample values to copy. Word searches
and crosswords receive separate system instructions, and structured output uses a lower temperature
to reduce format drift.
Independently of the template, generated crossword material is rejected when a clue contains its
answer or a longer word containing that answer. Common scaffold placeholders are also rejected. The
helper makes one automatic repair pass with the rejected output and exact leaking answers before it
surfaces the failure to the author. **Show response** displays every completion
exactly as received, including malformed output and separate initial and repair attempts. It also
reports the model's finish reason and explains when the output limit interrupted an incomplete JSON
object; failed validation never hides the model's response.

The application shell uses `@exactjs/theme` for its generated canvas, focus, typography, surfaces,
actions, and selection roles. Light mode uses pale neutral surfaces with blue accents. Color
controls pair each label with its swatch in a separate row. Its shared appearance control follows
the system preference by default and stores only an explicit light or dark override. Print-preview artwork and user-selected
puzzle colors remain part of the publishing document model rather than inheriting the application
theme.

## Build one portable file

```sh
npm run build:puzzle-generator:standalone
```

The result is `apps/puzzle-generator/dist/puzzle-foundry.html`. It contains the application,
styles, compiler output, framework runtime, and local-AI controller with no external script,
stylesheet, font, or image dependency for non-AI features. SVG downloads and all non-AI features
work when the HTML file is opened from disk. Optional AI requires HTTPS or localhost for WebGPU and
network access to load its pinned WebLLM runtime from jsDelivr. First use of each selection also
downloads that model; cached model inference remains local afterward.
