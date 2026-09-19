# Enhancement before/after fixture

This private fixture compares common behavior across the epoch-1 baseline and the current runtime:
plain fragments, enhanced intrinsics, enhanced component roots, explicitly placed hosts, and Intl.
The runner changes only `_target` child syntax for epoch 1. Both sides assert equal visible content,
host counts, contributed titles, and receiving-owner retention. Hydration identity losses are
recorded separately rather than silently counted as equivalent adoption work. Failed workloads
are recorded as unavailable and excluded from percentage comparisons.

Run `node scripts/benchmark-enhancement-comparison.mjs --before=<built-baseline-worktree>` after
building each checkout. Each revision uses its own compiler and runtime. Alternating isolated
processes produce raw samples, per-round medians, relative changes, and artifact sizes.
Client processes use twenty warmups and twenty-one samples. Server processes use five hundred
warmups and twenty-one samples to allow submillisecond workloads to reach steady compilation tiers.
SSR timing runs in a separate process
without a DOM, preventing preceding client work from contributing allocation or collection pressure
to server samples. Each browser workload also measures mount/updates and hydration in separate
fresh processes, avoiding cross-workload and cross-phase allocation pressure. Hydration still uses
the matching revision's server output.
Automatic fragment wrapping is excluded because it did not exist in the baseline.
