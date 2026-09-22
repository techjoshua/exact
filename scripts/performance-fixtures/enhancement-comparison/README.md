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

After rebuilding the workspace and native compiler, run
`node scripts/profile-enhancement-comparison.mjs` to diagnose the current implementation.
Use `--output <directory>` to retain a separate capture. The runner first records two unprofiled
protocol-2 timing rounds, then profiles each workload in separate client, hydration, and server
processes, reversing workload order in the second pass. Optional fixture observers delimit mount,
updates, hydration, string SSR, and stream SSR; parsing hydration input, assertions, and final
unmount are outside those windows. Ordinary timing runs do not supply an observer.

V8 samples at a requested 100 microseconds after 20 client or 500 server warmups. Each profile
contains 150 client or 1,000 server iterations. Raw profiles, monotonic phase windows, mapped
self/inclusive sample summaries, environment, and bundle hashes stay under
`.tmp/enhancement-profile` by default. Inclusive rows overlap and must not be summed. GC samples
identify collection during a phase, not the allocation site that caused it. Profile percentages
are sampled attribution, not unprofiled latency or projected optimization gains. The plain case
shares an enhancement-enabled bundle, and these JSDOM workloads do not measure browser layout,
paint, branch rerouting, or a genuinely enhancement-free application.

## Request-local Intl environments

The server fixture also exports `measureIntlRequests` for one-message and 100-message responses.
`fresh-same` creates an environment for each render, while `reused-same` retains one. The `mixed`
variants render a four-request batch containing three locales and two different catalogs for the
same French locale. Every result is checked against its own catalog's expected text. Fresh-mode
timing includes environment, descriptor, and catalog preparation. Batch wall time is divided by
request count; this is amortized batch cost, not individual concurrent-request latency.

Build both variants with `benchmark-enhancement-comparison.mjs --build <workspace> <artifacts>
after --sourcemap`, then run:

```sh
node scripts/benchmark-intl-requests.mjs --compare <before-artifacts> <after-artifacts> <output>
```

The runner alternates variants across four rounds, reverses workload order, and creates a fresh
process for each workload and variant. Each process performs 200 warmup batches and retains 31
observations, each averaging 16 batches. It records artifact hashes, environment, raw observations,
and paired results. Keep output under `.tmp`. This measures reuse after process warmup, including
fresh environments; it does not measure a cold process's first locale lookup, network traffic,
streaming SSR, or asynchronous component suspension.
