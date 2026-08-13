# eXact Puzzle Foundry sample

A browser-local puzzle publishing app built with native eXact components. It creates uniquely
solvable 4×4 and 9×9 Sudoku puzzles, rectangular word searches, and compact connected crosswords.
Every generator is deterministic from a visible seed. Puzzle and solution artwork use the same
print settings but export as separate SVG files. Titles are optional, align left, center, or right.
Titles, puzzle grids, and word-list or crossword-clue sections each have independent font and size
controls, with expanded type-size ranges. The three publishing presets are 8.5 × 11, 7 × 10, and
6 × 9 inches, joined by custom page width and height controls. Narrow, standard, and wide margin
presets can likewise be replaced with a custom uniform margin. The 8.5 × 11-inch format is always
the initial page. The preview scales the resulting fixed-size page to the screen.

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

## Bulk puzzle sets

Every puzzle type can export 1–100 content-unique puzzles at once using the current input,
difficulty, dimensions, seed, and print styling as its template. Generation derives repeatable
candidate seeds from the visible seed, rejects duplicate generator models, and reports progress or
allows cancellation while the set is assembled. A bulk download is a ZIP with numbered
`puzzles/puzzle-001.svg` and `solutions/solution-001.svg` paths plus a `manifest.json` that records
the public generation request and the seed for each pair. OpenAI credentials and browser settings
are never included. If the selected input cannot produce the requested number of distinct results,
the operation reports that limitation instead of padding the archive with duplicates.

## Optional OpenAI input authoring

Word searches and crosswords include an opt-in topic helper powered by the OpenAI Responses API.
The author supplies an API key and model ID; `gpt-4.1-mini` is the initial model. Saving the key
stores it in this origin's `localStorage`, never in component state, prompts, exported artwork, or
URLs. The interface warns that scripts executing on the same origin can read local storage and
provides a control to remove the key. Authors should use a restricted key and clear it on shared
devices. This explicit user-owned-key mode carries more exposure than OpenAI's recommended
server-side key handling and is intended for authors who accept that tradeoff. Topics, prompt
templates, and generated material are sent to OpenAI when the author explicitly generates a list.
Ordinary puzzle generation remains browser-local and needs no key.

OpenAI output is constrained to JSON, normalized, deduplicated, and passed through the same safety
validation as authored words before it can replace the editable list.

The helper's **Show prompt** control exposes a separate editable template for word searches and
crosswords. `{{topic}}` marks where the topic is inserted, and **Reset template** restores the
shipped prompt for the current puzzle kind. Both defaults request pools of 20 items. The crossword
template asks for short conventional clues, requires topic relevance and accurate answer/clue
pairing, and forbids answer variants in clues. Both templates spell out the required top-level JSON
property, item count, property names, prohibition on prose or Markdown fences, and required opening,
item, separator, and closing syntax without giving the model sample values to copy. Word searches
and crosswords receive separate system instructions and strict JSON schemas.
Independently of the template, generated crossword material is rejected when a clue contains its
answer or a longer word containing that answer. Common scaffold placeholders are also rejected. The
helper makes one automatic repair pass with the rejected output and exact leaking answers before it
surfaces the failure to the author. **Show response** displays every completion
exactly as received, including malformed output and separate initial and repair attempts. Failed
validation never hides the model's response.

## Build one portable file

```sh
npm run build:puzzle-generator:standalone
```

The result is `apps/puzzle-generator/dist/puzzle-foundry.html`. It contains the application,
styles, compiler output, framework runtime, and OpenAI client with no external script, stylesheet,
font, or image dependency. SVG downloads and all non-AI features work when the HTML file is opened
from disk. Optional input authoring requires network access to `api.openai.com` and a user-supplied
API key.
