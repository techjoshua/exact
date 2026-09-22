# September 2026 performance findings

This retrospective consolidates consequential findings recorded through September 22, 2026.
It is an immutable historical account, not a current benchmark baseline or a claim that a private
prototype remains reproducible. Add a linked correction if later evidence changes a conclusion.
Current capture identity belongs in [the performance guide](../performance.md).

## Establish implementation and environment identity first

The September 18 WSL comparison resolved published packages nested under the comparison workspace,
not the intended branch implementation. A source SHA did not establish which runtime was loaded.
Later captures checked workspace resolution. Other comparisons changed visual workloads or routed
loopback through WSL virtual Ethernet; neither an unchanged source tree nor a framework ratio
isolated those effects. Benchmark admission must establish resolved dependencies, equivalent
presentation, native loopback, and the complete toolchain before interpreting speed differences.

Fresh processes per offered arrival rate, target-rate warmup, and reversed framework/rate order
separate sustained-demand measurements from sequential-rate history. Preserve missed arrivals and
warmup failures. Response percentiles describe requests that ran, not demand that was never sent.
Cross-day and cross-platform results are not controlled before/after measurements.

## Throughput does not excuse lifecycle regressions

On Bun 1.4.2, a September 21 direct-stream probe observed no cancellation-hook or producer-finally
callback after reader cancellation, unlike standard-stream controls. This was a lifecycle probe,
not an HTTP-disconnect or throughput test. The previously faster success-only prototype could not
establish the required cleanup contract; a standard wrapper also failed the combined throughput
and bounded-production goals. Reconsideration needs a proven ownership design or runtime change,
not relaxed cancellation, backpressure, hydration, or output-limit requirements.

September scheduling experiments likewise rejected shorter Bun string probes when lower tails
came with throughput losses, Node string retention, and extra traversal/publication CPU yields.
The accepted full capture at `dd3d7e69b31d7fd638c1af015cce3e49e422573b` used a host-shared
half-millisecond Bun progressive-render work window while retaining string and initial-admission
policies. Focused follow-up controls did not erase unfavorable full-run results or recover every
historical tail. Renderer policies must be judged across API lanes, page sizes, tails, and capacity.

The earlier compiler-composed SSR structural-block proposal was not adopted. Contradictory timing
results and missing semantic coverage did not justify changing structural ownership. This decision
does not prohibit a later bounded optimization backed by representative, repeated evidence.

## End-to-end timing needs attribution

The September 22 authoritative-settlement investigation separated service work, stream receipt,
browser scheduling, and DOM publication. The published eXact/React means of 12.960/12.217 ms did not
establish that React applied authoritative state faster. In a focused default-policy control,
receipt-to-DOM intervals were 0.425/1.165 ms. Those diagnostic populations differed from the admitted
full run and did not replace its charts. Removing optimistic feedback to improve a timing would
have violated the application contract.

## Enhancement and Intl results have bounded scope

The enhancement-target comparison initially regressed. Later isolated pairs improved mounting and
hydration consistently, while some SSR/update results varied and bundle growth remained material.
Subsequent capability pruning reduced unused dependencies, but cross-day charts did not establish
a complete paired acceptance result. The original Intl fixture failed; fixing that fixture did not
reconstruct its missing historical comparison. Keep broader acceptance open until the required
controlled measurements exist.

September 22 Intl investigations first reused a fallback chain per environment, then shared bounded
immutable fallback lists across environments. The first measured roughly 33% string-SSR and 30%
stream-SSR reductions in its reused-environment fixture. The second improved fresh mixed-locale
request batches consistently, with variable same-locale/reused-environment results. These are
different populations, not additive general application speedups. Mutable locale state, catalogs,
callbacks, and reporting remained environment-owned.

## Historical sources

The [original reports and recorded results](https://github.com/techjoshua/exact/tree/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines)
retain the dated methods, limitations, and individual observations. The
[enhancement comparison](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/enhancement-performance-comparison.md)
and [SSR completion decisions](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/ssr-completion.md#closed-experiment-decisions)
provide their original context. Some measurements used dirty worktrees or private diagnostic runners;
rebuilding the recorded framework revision does not recreate those variants or exact timings.
