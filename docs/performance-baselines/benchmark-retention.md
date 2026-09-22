# Benchmark result retention

Keep concise measured results, methodology, environment and runtime versions, sample counts,
correctness outcomes, limitations, and the source revision. The public chart inputs in
`apps/docs/src/data` are derived results and remain committed. Structured comparison summaries
may retain historical input names and hashes to identify which measurements they describe.
Those names are provenance metadata, not downloadable files or publisher inputs.

Do not commit generated application bundles, copied workspace sources, source-file hash inventories,
ZIP evidence packages, bulk per-request samples, browser traces, CPU profiles, or build logs.
Keep working captures in ignored local output directories while investigating and publishing results.
Rebuild committed implementations from their Git revisions using the repository lockfile and the
recorded toolchain. Use the [comparison commands](../../framework-comparison/README.md#start-here)
and [measurement methodology](../../framework-comparison/methodology.md) to collect new results.
A rebuild can reproduce an implementation, not the exact timings of a previous run.

Commit reusable benchmark methods as maintained harness source when they are needed for future
comparisons. Do not distribute private experiment directories as source archives. Record whether
a measurement used a clean checkout or uncommitted modifications. A revision plus a dirty worktree
marker cannot reconstruct an uncommitted prototype; describe such experiments as historical
observations, not exactly reproducible checkouts.

## September 2026 branch cleanup

The framework comparison work added 345 baseline files totaling about 1.29 GiB. The cleanup removes
252 raw JSON captures and 32 ZIP bundles added by that branch. It retains 32 reports and 29
structured result summaries, removing copied runner source and per-file source inventories from
those summaries. Published chart values and benchmark implementation code are unchanged.

Existing baselines from before this branch are outside this cleanup. Historical references to raw
capture paths in the retained reports and summaries identify the original measurement inputs;
the bulk files are no longer distributed. Private rejected variants and diagnostic runners were
not all committed, and are not recoverable merely by rebuilding a recorded framework revision.
Their retained conclusions and methods do not imply that those prototypes remain available.

The latest full run measured implementation `dd3d7e69b31d7fd638c1af015cce3e49e422573b` with a clean
tracked source state. See its [report](bun-output-policy-final-2026-09-22.md) and
[structured results](bun-output-policy-final-2026-09-22.json). Later authoritative-settlement
diagnostics left production sources unchanged and did not replace the published full-run results.

Deleting files changes the current checkout, not earlier Git commits. Squash this branch when
merging to avoid adding its intermediate bulk captures to the main branch's ancestry. Repository-wide
history cleanup and storage reclamation require a separate effort.
