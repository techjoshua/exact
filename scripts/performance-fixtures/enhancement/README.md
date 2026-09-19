# Enhancement presentation benchmark fixture

This private application compares plain text fragments, explicitly authored presentation hosts,
direct intrinsic targets, coalesced contributors, and equivalent runtime-selected enhancement hosts
through production compiler output. Real Intl
message components provide transparent and contributed-fragment workloads under their provider.

Run `node scripts/benchmark-enhancement-presentation.mjs` from the repository root after building
the workspace. Measurements and compiled outputs are written under `.tmp/enhancement-presentation`.
The runner checks scalar updates, hydration identity, wrapper counts, and receiving-owner disposal
before recording timings. It also measures server strings, streams, first-byte latency, and
post-GC churn when run with `--expose-gc`. Broad same-run timing ratios guard against repeated work;
raw samples and environment details remain available for comparison. These controls are not a
previous-release benchmark. This is a private diagnostic workload.
