# Scalar text runs, September 8, 2026

Status: implemented, tested, and retained with the optimized scalar writer. The subsequent
[forced-rebuild comparison](ssr-fresh-build-2026-09-08.md) confirms the emitted artifacts and isolated
rendering gains, but finds no consistent HTTP winner between marker strategies. The measurements
below predate that build audit. Public aggregate charts remain unchanged.

## Implementation

For `<small>{owner} / {status}</small>`, the server emits one continuous text span. The client keeps
both scalar operations and the literal separator. Claim opcode 8 records the run; ordinary initial
bindings collect their values under normal dependency tracking. After validating all runs in the
program, adoption uses `Text.splitText()` to assign each scalar its own Text node. Offsets are UTF-16
lengths, not delimiter searches. Empty values get separate nodes, including an entirely empty run.
No authored calculation is evaluated a second time to determine boundaries. Temporary values and
run plans are released after initial binding or disposal. Mismatch recovery uses the existing root
replacement path. Mixed structural content retains its existing boundary strategy.

The synchronous scalar writer also has a direct markerless path that skips empty-marker accounting
and composition while retaining escaping and output limits.

This is an additive extension to the unpublished 0.5.0 baseline. Existing opcodes and helpers keep
their semantics, and frozen release artifacts were tested without regeneration. New compiler output
requires the matching DOM runtime. There is no new application API or hydration-state format.

## Measurements

Windows workstation, Node 26.8.1, Bun 1.4.2, production mode. Timing workloads ran serially, without
builds or tests competing with them. Other workstation activity was not controlled. The initial before/after
production SSR bundles differ only in the two scalar writer calls that now request marker omission.
The tested follow-up additionally specializes the synchronous markerless scalar writer.
Response identity checks retain all dynamic content and hydration data.

### Isolated repeated-row rendering

Each row has two independent state values separated by literal punctuation. Twelve alternating
rounds follow warmup, with 5,000 / 1,000 / 200 renders per round for 3 / 100 / 1,000 rows.
These are complete HTML-plus-hydration renders without HTTP, not requests-per-second measurements.
Bun executes the same Node-target renderer artifact in this test.

|  Rows | Node before (us) | Node after (us) | Bun before (us) | Bun after (us) | Bytes saved |
| ----: | ---------------: | --------------: | --------------: | -------------: | ----------: |
|     3 |             8.76 |            8.30 |            8.13 |           7.62 |         126 |
|   100 |           135.60 |          122.62 |          169.44 |         142.79 |       4,200 |
| 1,000 |         1,610.94 |        1,424.73 |        1,961.56 |       1,749.95 |      42,000 |

### Browser adoption and updates

Headless Chromium uses the real generated client artifacts, with no injected split helper. Each
capture has twelve alternating rounds per size. Hydration timing includes splitting and binding,
but excludes parsing the HTML into the container. Checks verify retained elements, three Text nodes
per row, and independent updates. Small-row timing is near timer resolution.

| 1,000 rows         | Before, capture 1 (ms) | After, capture 1 (ms) | Before, capture 2 (ms) | After, capture 2 (ms) |
| ------------------ | ---------------------: | --------------------: | ---------------------: | --------------------: |
| Hydrate            |                  16.33 |                 15.77 |                  16.36 |                 16.17 |
| Update one field   |                  1.006 |                 0.958 |                  0.995 |                 0.958 |
| Update both fields |                  1.458 |                 1.494 |                  1.445 |                 1.446 |

The large fixture does not show the update penalty of replacing both bindings with a joined
expression. Smaller fixtures have mixed results, retained in the raw evidence.

### Actual comparison document

The document shrinks from 3,611 to 3,485 bytes, a 126-byte (3.49%) saving. React remains 3,384 bytes.
Removing comments makes the before/after eXact documents identical, including hydration state.
Twenty-four alternating rounds of 5,000 full-document renders follow 10,000 warmup renders.

| Runtime                   | eXact before (us) | eXact after (us) | React (us) |
| ------------------------- | ----------------: | ---------------: | ---------: |
| Node                      |             13.80 |            13.24 |      16.83 |
| Bun, Node-target artifact |             13.96 |            13.80 |      23.46 |

Before the direct scalar path, a repeat measured Node 13.68 / 13.50 / 17.05 microseconds and Bun 13.64 / 13.91 / 22.51
microseconds (before / initial implementation / React). The initial implementation therefore
has a small Node gain and a Bun regression on the real fixture.

A follow-up bypasses empty-marker bookkeeping in the synchronous scalar writer. In a paired
four-way capture, Node measured 13.78 / 13.49 / 13.06 / 16.84 microseconds and Bun measured
13.85 / 13.95 / 13.85 / 22.82 (before / initial implementation / direct path / React).
The direct path improves the Node renderer and recovers the Bun renderer's baseline in that run.
The final source-built capture is shown in the table above. These renderer measurements do not imply the same percentage change in HTTP throughput.

## HTTP results

All participants used Node HTTP on the same host with preloaded controlled-service data. Each fresh
population used the reverse order of the preceding population. The two-driver runs used 16 in-flight
requests per driver (32 total) for ten seconds after five seconds of warmup, followed by ten seconds
at 3,000 scheduled requests per second per driver (6,000 total). Standard worker and adapter paths
were used, with response identity and artifact hash checks.

| Two-driver capacity           | eXact before | eXact initial implementation |  React |
| ----------------------------- | -----------: | ---------------------------: | -----: |
| Original bytes, population 1  |       10,919 |                       10,129 | 12,256 |
| Original bytes, population 2  |       10,844 |                       10,095 | 12,274 |
| Padded to 8 KiB, population 1 |        9,284 |                        8,738 | 10,544 |
| Padded to 8 KiB, population 2 |        9,286 |                        9,284 | 10,219 |

The initial implementation regressed original-size capacity in both populations. Equal payload size
did not consistently remove that difference. A preceding single-driver check was inconclusive:
9,154 / 9,207 / 9,392 RPS in one population and 8,867 / 8,691 / 9,285 in the other
(before / initial implementation / React). Single-driver results are not pooled with two-driver runs.

The direct scalar path improved the result but did not reverse the HTTP regression:

| Two-driver capacity with direct scalar path | eXact before | eXact after |  React |
| ------------------------------------------- | -----------: | ----------: | -----: |
| Population 1                                |       10,821 |      10,382 | 12,203 |
| Population 2                                |       10,754 |      10,212 | 11,931 |
| Mean                                        |       10,788 |      10,297 | 12,067 |

That is 4.5% below the eXact baseline and 14.7% below React. The direct-path HTTP candidate was
compared with the final source-built participant using deterministic minification; the generated
JavaScript matched exactly. The smaller payload and isolated rendering gain therefore do **not**
establish an end-to-end throughput improvement. The cause of the remaining HTTP regression is
unresolved. This change has not met the goal of matching React HTTP throughput.

There were zero request errors across these HTTP captures. Scheduled demand still had missed
admissions, retained in the evidence: 62 in the single-driver run, 66 in the initial two-driver run,
49 with equal payloads, and 29 with the direct path. In the last run, before/after/React missed
11 / 3 / 15 of their respective 120,000 offered requests; these were never counted as successes.

## Validation and evidence

The focused regression tests cover empty values, booleans, null/undefined, numbers, Unicode,
HTML-special characters, repeated separator text, independent updates, and one authored evaluation
per initial binding. DOM tests verify rejection of malformed topology and validation of all runs
before splitting any. Production application tests verify hydration without replacing the root,
optimistic interactions, live updates, forms, and recovery.

The first application browser attempt used a stale packaged DOM runtime and failed. Rebuilding the
conditional browser/server outputs with `compile-exact-package.mjs packages/dom` resolved it; the
new paired application run passed all 14 tests. The source-based package suite had already passed
987 tests. After the direct scalar path and additional recovery/UTF-16 cases, 246 SSR and text-run tests
passed. The new compiler tests and frozen 0.5.0 ABI checks pass; package contents pass as well.
Focused lint, test type checking, architecture and platform checks pass. The docs app passes its
verification build, and the final production eXact/React browser run passes all 14 tests.

Raw captures, paired artifacts, fixture source, runner scripts, and SHA-256 inventory are retained
in [the evidence archive](ssr-text-runs-2026-09-08-evidence.zip).
[The machine-readable summary](ssr-text-runs-2026-09-08.json) retains all captures and samples. These targeted experiments do not replace the full public
browser/heap/five-framework benchmark suite or establish peak HTTP capacity.
