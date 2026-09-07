# Lazy root observation, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Followup: a [300-pair claim test](lazy-root-confirmation-2026-09-06.md) confirmed a small mean
first-claim feedback slowdown (+0.082 ms, 5.4%) alongside the retained-heap benefit. Faster repeated
filtering does not imply faster performance for every interaction.

Keep the core runtime change that creates reactive root state and its frozen lifecycle facade on
first observation. The renderer still retains current root identity, generation, introduction, and
presentation from its first publication. No compiler or ABI change is required.

This follows the [initial shape experiments](runtime-object-shape-experiments-2026-09-06.md).
Their small field-order improvement remains in this experiment's baseline. The new
measurement data (local capture: `lazy-root-observation-2026-09-06.json`) preserves frozen artifact hashes,
ordered paired samples, summaries, and a separate snapshot breakdown.

## Finding and implementation

The first audit recognized only selected renderer families. A whole-heap inventory instead found
seven frozen root-lifecycle objects with seven distinct maps and five getter closures apiece. None
was observed by application code in the comparison fixture. `publishComponentRoot()` nevertheless
created each facade and a general reactive proxy, then published every renderer root update through
that proxy. Shared proxy traps already existed; sharing those functions again was not the opportunity.

`packages/core/src/component/root-lifecycle.ts` now starts with plain private root history. Calling
`this.refs.root()` or explicitly binding a root promotes that same history to reactive state and
creates the stable frozen facade. Facade presence replaces the redundant `observed` boolean. This
preserves late observation, exact-generation release reversal, ref ownership, reactive updates after
observation, and clearing held facades on disposal. Unobserved releases still do not retain a
structural target for nonexistent observers.

The saving is conditional on usage: observed roots still acquire the reactive machinery they need.
The experiment does not establish a speedup for applications that observe every component root.
Lazy initialization adds a first-observation branch; it does not remove the public lifecycle API or
make component state less inspectable.

## Interleaved measurements

Chromium 149.0.7827.55 loaded the same controlled incident URL using alternating frozen eXact script
bytes, fresh browser contexts, disabled cache, and rotating/reversing order. The baseline includes
the earlier scope and mount-field-order changes; it is not the user's older pre-experiment build.
The candidate changes only root lifecycle construction. Builds and tests did not run alongside
timed experiments. Every claim and filter row-count assertion passed. Runners restored script bytes
and closed their browser/server owners.

Post-claim diagnostics used one discarded warmup round and five paired rounds. They waited for live
readiness, completed the authoritative claim (Alex Chen, version 2), allowed a rendering opportunity,
collected garbage, sampled heap counters, then captured snapshots. Delivered script hashes were
verified. All five pairs reproduced these heap and category values:

| Metric                     |  Baseline | Candidate |  Change |
| -------------------------- | --------: | --------: | ------: |
| Delivered JavaScript bytes |   197,006 |   196,756 |    -250 |
| Post-GC JS heap bytes      | 1,643,116 | 1,623,024 | -20,092 |
| Snapshot code-node bytes   |   723,388 |   709,228 | -14,160 |
| Snapshot shape-node bytes  |   166,992 |   166,580 |    -412 |

Snapshot self sizes and `JSHeapUsedSize` measure different quantities; category deltas are not an
additive partition of the heap counter. A separate whole-heap snapshot comparison found seven fewer
proxies, 35 fewer lifecycle getter closures, and nine fewer map nodes. Within code nodes, instruction
streams fell 9,792 bytes and feedback vectors fell 1,044 bytes. Thus most of the gain was associated
with less executed/retained reactive machinery, not just descriptor normalization. This comparison
does not establish a specific inline-cache state or attribute every changed machine-code byte to a
particular function.

Startup used three discarded warmup rounds and 40 paired rounds at 6x CPU throttling. The collector
checked semantic response identity and decoded script sizes. Ratios below are geometric means of
paired candidate/baseline values, with 10,000 bootstrap resamples of complete pairs:

| Startup metric       | Baseline median / p95 | Candidate median / p95 | Paired ratio, 95% interval |
| -------------------- | --------------------- | ---------------------- | -------------------------- |
| Script work (ms)     | 126.443 / 168.620     | 125.666 / 158.033      | 0.971 [0.920, 1.023]       |
| Evaluation (ms)      | 140.401 / 186.121     | 140.796 / 181.892      | 0.979 [0.927, 1.032]       |
| Post-GC heap (bytes) | 2,357,644 / 2,362,596 | 2,325,544 / 2,330,496  | 0.9864 [0.9859, 0.9869]    |

Startup timing remains inconclusive. The median startup heap saving is 32,100 bytes in this profiled
lane; it should not replace the separately collected unprofiled post-claim figure.

Updates used one discarded warmup round per capture, then 20 paired rounds followed by an independent
40-pair repeat. Each fresh page warmed 20 filter transitions and measured 200 alternating critical/all
transitions, awaiting two microtasks and checking row counts after every transition. Script hashes
were verified. This is a synchronous/microtask update burst, not painted latency for 200 user events.

| Capture        | Baseline median / p95 ms | Candidate median / p95 ms | Paired ratio, 95% interval | Mean post-GC heap saving |
| -------------- | ------------------------ | ------------------------- | -------------------------- | -----------------------: |
| 20 pairs       | 33.1 / 34.2              | 30.2 / 32.5               | 0.919 [0.898, 0.941]       |               50,851.8 B |
| 40-pair repeat | 33.3 / 36.4              | 29.9 / 31.8               | 0.886 [0.872, 0.899]       |               50,986.3 B |

The focused update improvement reproduced, approximately 8–11% by paired ratios. The repeat's heap
means were 2,430,810.2 and 2,379,823.9 bytes. These results support retaining this implementation;
they do not establish a framework-wide percentage improvement or a general startup speedup.

## Validation and documentation

Three new contract tests cover late observation after root replacement and presentation changes,
reactive release/reversal/settlement, early observation, and disposal of held facades. Existing DOM
root tests cover explicit refs and retained structural work. Core, DOM, hydration, and SSR suites
passed 940 tests; composition/hydration corpus checks passed 17; browser comparison checks passed 35.
The core build, target projections, comparison builds, test type checking, documentation verification,
lint, JSDoc, architecture, and platform-boundary checks passed.

Engineering and public component documentation clarify that root observation may begin after mount.
The public charts were subsequently refreshed from a separate
[full comparison capture](framework-comparison-lazy-root-2026-09-06.md); these focused experimental
samples were not mixed into that population.
