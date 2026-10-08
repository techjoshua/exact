# Performance measurement

This guide owns measurement commands, correctness admission, and interpretation. The
[framework comparison](framework-comparison.md), [load guide](ssr-load-testing.md), and
[comparison methodology](../framework-comparison/methodology.md) define their respective workloads.
Follow the [retention policy](performance-baselines/benchmark-retention.md): raw captures and
per-run generated reports belong in ignored local storage.

## Browser comparison priorities

Visible content and working interactions lead the browser comparison. The public page shows
the browser load event, FCP, and pre-click LCP, followed by optimistic feedback and server
settlement. Each chart has a percentile table. The chart library generates the percentile,
heap-composition, and concurrency tables from their chart data, including labels and formatting.
Browser Event Timing and startup layout shifts remain in the benchmark evidence but are not shown as public charts.
The load event measures document loading and does not establish that every interaction works.
Service-connection readiness and resource costs remain in expandable diagnostics. Startup-click
checks remain part of the benchmark evidence rather than a separate public table. The [browser methodology](../framework-comparison/methodology.md#user-visible-browser-measurements)
defines each observation window and its limits. Every framework uses the same collector.

Changing observers or their boundaries changes the measurement protocol. Rerun all five
participants together when refreshing these results. Historical diagnostic navigation times
must not be presented as a framework speedup against an older, differently instrumented capture.

## How eXact reduces work and waiting

Compiler-tracked dependencies target browser updates at affected expressions and DOM regions.
During SSR, task input readiness determines when compiler-described work becomes eligible. The
request-owned scheduler starts ready work synchronously when a permit is free, avoiding an extra
microtask before that task starts I/O. `maxAsyncSsrConcurrency` defaults to 4 and is capped at 32.

Components with compiler-attached execution subgraphs prepare reachable children before draining
all their own setup work. Independent child tasks can therefore overlap while HTML traversal
remains ordered. Structural inputs, inactive branches, actual data dependencies, and compatibility
boundaries still constrain discovery and execution. This does not speculate across unselected
branches or parallelize arbitrary sequential JavaScript. See [SSR and hydration](ssr-hydration.md)
for the full execution contract.

The Node adapter separately coordinates host-level rendering admission. It measures event-loop
delay and completed-response throughput, trials bounded batches of starts with yielding, and
retains or backs off that policy based on observed results. This schedules framework work to leave
opportunities for network I/O. It does not modify Node's event loop or network stack. A batch limit
bounds starts, not synchronous render duration. Client latency remains an external measurement.
When reassessing a previously selected policy, Node and Bun bound uninterrupted immediate starts
before restoring scheduled admission. This lets a responsive alternative complete its trial while
stopping a disruptive probe before it admits more work. The guard cannot interrupt an individual
render. See the [admission policy](ssr-hydration.md) for its observation windows and limits.

Early and parallel data loading also exist elsewhere. Next.js documents
[parallel fetching and preloading](https://nextjs.org/docs/app/getting-started/fetching-data#parallel-data-fetching).
SvelteKit runs [page and layout loaders concurrently](https://svelte.dev/docs/kit/load#Parallel-loading),
and TanStack Router provides [parallel route loading](https://tanstack.com/router/latest/docs/guide/data-loading).
Svelte also runs independent [async markup expressions concurrently](https://svelte.dev/docs/svelte/await-expressions#Concurrency).
These documented approaches do not establish equivalence to eXact's task ownership and scheduling,
but they rule out describing early parallel work as exclusive to eXact. The supported eXact claim
is its integration of component-local tasks, compiler-described dependencies, request-owned
scheduling, and cancellation. This is a comparison of documented mechanisms, not a cross-framework
execution experiment.

The published benchmarks measure complete workloads. They do not isolate how much performance
comes from dependency scheduling, targeted updates, or host admission. Explain these mechanisms
as design choices and evaluate their combined results under the recorded workload and environment.

## Current results and interpretation

The latest full comparison measured clean revision `f50443c4` on October 8, 2026 (UTC).
The [maintained results](performance-baselines/results.json) record source identities,
resolved dependencies, environment, commands, correctness, and derived values. Public charts
use compact inputs under `apps/docs/src/data`. A subsequent partial SSR repeat at `04a13e83`
refreshed the groups described below. All other groups and earlier focused investigations retain
their own source identities and dates.

All 39 phases completed, including fresh builds, all five controlled browser participants,
Node and Bun buffered and streaming correctness, native full-stack measurements, and internal
performance guards. No source repairs were needed during this repeat. The compiler, runtime,
and controlled application implementation are unchanged from the preceding full capture at
`7b6cb3ae`. Recorded eXact, React, service, and adapter artifact hashes match that capture in
all four server lanes. Timing differences therefore do not demonstrate a source improvement
or regression between these runs.

The run used Node 26.9.0, Bun 1.4.2, Chromium 149, and native loopback in one private network
namespace. The user reported a host restart before the earlier preliminary probe, but no additional
reboot occurred for this full repeat. Other user activity was uncontrolled. Browser measurements
used 200 balanced samples per framework. Startup profiling used ten samples at each of three CPU
rates, and heap composition used five rounds. Sustained captures used two reversed process
populations. Each offered rate owned fresh processes, with 30 seconds of target-rate warmup and
60 seconds of measurement. Response identities, artifact consistency, and accounting validated.

Comparisons below use the preceding full capture at `7b6cb3ae`. They repeat the protocol with
identical recorded server artifacts but without exclusive-host control. Warmup failures and missed
demand remain visible in the maintained results. A completed phase means its capture validated,
rather than that every offered workload sustained demand.

### Browser experience

eXact's mean load-event time changed from 22.39 to 23.26 ms, with P95 at 25.20 ms and P99 at
25.60 ms. SvelteKit averaged 25.39 ms, React 40.21 ms, Nuxt 39.00 ms, and TanStack Start
62.43 ms. The load event remains separate from paint and working interactions.

Mean eXact first contentful paint changed from 51.52 to 58.50 ms, with P50 at 60 ms and P95
and P99 at 64 ms. FCP and the latest pre-click LCP coincided in this dashboard capture.
Service readiness averaged 66.81 ms. Optimistic feedback averaged 2.39 ms and server settlement
12.09 ms, compared with 1.87 and 12.96 ms previously. Warm retained JavaScript heap was
2.631 MB, compared with 2.636 MB. Transferred script payload remained 243.950 kB.

All five frameworks passed all five first-paint click probes. All 50 clicks admitted after
an observed paint passed. The other 50 pre-paint clicks are excluded consistently and counted
separately. A row with no admitted clicks provides no early-interaction evidence. These small
populations do not establish behavior for every device or startup timing.

The separate CPU-throttled profile measured eXact script CPU means of 23.64, 119.11, and
186.63 ms at 1×, 4×, and 6× throttling, compared with 22.71, 95.60, and 141.30 ms previously.
Its instrumentation differs from the ordinary browser collector and should not replace that
collector's paint measurements. The slower throttled results remain part of this comparison.

### Server capacity and tails

The preloaded sweep peaked at 15,449 valid RPS for Node buffered responses at concurrency 128
and 16,877 for Node streaming at concurrency 64. The previous peaks were 15,350 and 13,941 RPS.
Bun peaked at 13,531 RPS buffered at concurrency 32 and 11,183 streaming at concurrency 16,
compared with 12,742 and 10,299 previously. The chart retains every concurrency level and both
populations. Percentile ranges span driver populations rather than pooling their distributions.

At 8,000 offered RPS, all four eXact lanes sustained measured demand with no response errors or
capacity misses. Node buffered mean latency was 0.97 ms with P99 of 8.38–9.96 ms, and Node
streaming averaged 1.13 ms with P99 of 11.92–12.51 ms. Bun buffered averaged 1.49 ms with P99
of 11.62–13.14 ms. Bun streaming averaged 4.21 ms with P99 of 33.47–35.84 ms. Previously Bun
streaming missed 2.32% of demand at this rate.

At 10,000 offered RPS, Node buffered, Node streaming, and Bun buffered sustained measured demand
with no capacity misses. Node buffered averaged 1.62 ms with P99 of 17.76–18.66 ms, compared
with 3.55 ms and 23.18–29.12 ms previously. Node streaming averaged 2.00 ms with P99 of
22.24–23.86 ms, compared with 4.65 ms and 35.01–36.19 ms. Bun buffered averaged 2.57 ms with
P99 of 22.90–24.90 ms, worse than its previous 2.27 ms mean and 6.60–8.28 ms P99.

Bun streaming did not sustain 10,000 offered RPS. It completed 7,983 RPS with 20.09% capacity
misses, a 61.36 ms mean, and P99 of 103.42–103.87 ms. Previously it completed 7,655 RPS with
23.37% capacity misses, a 64.31 ms mean, and P99 of 95.87–105.98 ms. The improved throughput
retains this path's demand limit. No eXact measurement or warmup recorded response errors.
Warmup capacity misses and deadline misses remain recorded separately, including in lanes whose
measurement windows sustained demand.

Ordinary-fetching throughput was 3,891 RPS for Node buffered, 3,837 for Node streaming,
4,841 for Bun buffered, and 4,594 for Bun streaming. Previous values were 3,673, 3,399,
4,609, and 4,343 respectively. Node streaming's mean was 8.32 ms with P99 of 15.26–17.90 ms.
Bun streaming averaged 6.94 ms with P99 of 15.30–15.90 ms.

The results retain React's Node streaming response errors and each framework's missed arrivals.
Unsent requests have no response latency, so percentiles alone do not describe overload.
This repeat shows that substantial timing movement can occur with identical server artifacts.
It does not identify the host or scheduler mechanism behind that movement. The matched source
investigations below provide separate evidence about revision differences.

### Partial SSR repeat

The October 8, 2026 (UTC) repeat at clean revision `04a13e83` reran Node buffered capacity,
Node buffered and streaming ordinary fetching, and Bun streaming capacity, fetching, and scheduled
demand. The same maintained collectors and load plans ran sequentially in a native-loopback
namespace after all 56 selected browser checks passed. Other chart groups retain their earlier
dates and revisions. Node's refreshed and retained groups therefore represent different captures.

Node buffered capacity peaked at 18,296 RPS at concurrency 64, compared with 15,449 at
concurrency 128 in the preceding full run. React's peak increased from 13,471 to 13,736 RPS.
eXact's throughput improved 18.4%, and its ratio to React's own peak improved 16.1%. Both
frameworks' complete curves remain in the maintained results. Ordinary Node buffered fetching
was nearly unchanged at 3,924 RPS (+0.9%), while Node streaming fetching fell to 3,700 RPS
(-3.6%). Their ratios to React changed +0.1% and -6.4%, respectively.

Bun streaming capacity reached 11,378 RPS (+1.7%), while its ratio to React's peak fell 1.4%.
Ordinary fetching reached 4,727 RPS (+2.9%), improving its ratio to React 1.8%. At 8,000 offered
RPS it sustained demand with no capacity misses. At 10,000, it completed 8,313 RPS with 16.79%
capacity misses, compared with 7,983 RPS and 20.09% previously. P99 fell from 103.42–103.87 ms
to 100.29–100.99 ms. Response errors were zero in every eXact measurement and warmup.
Deadline misses, warmup misses, and React's missed demand remain visible in the retained summaries.

The strong Node capacity recovery supports checking transient conditions before assigning the
earlier loss to framework source. It does not identify a host cause or establish recovery in every
workload. Current source also includes the small hydrated-result constructor change at `5db717a0`,
whose isolated request-load comparisons were flat or mixed. These captures cannot separate that
change from host variation, and are not a fresh matched comparison against branch-start source.
`targetedServerRefresh` records the refreshed groups and their limits in the maintained results.

### Matched Node fetching follow-up

A focused October 8, 2026 (UTC) comparison rebuilt framework source at `d0f281ae` and
`843d5a16` with each revision's own compiler and runtime. The current application, harness,
installed third-party dependencies, Node version, and service were held fixed. These are controlled
source substitutions rather than untouched historical checkouts. Both revisions passed 14
selected eXact/React browser scenarios in each rendering mode, 56 checks total.

Each capture used two fresh reversed framework populations, two drivers, 10 seconds of warmup,
and 20 seconds of ordinary fetching at total concurrency 32. The second pair reversed revision
order. All traffic used native loopback in one private namespace. Buffered throughput changed
from 4,103 to 4,126 RPS in the first pair (+0.6%), and 4,070 to 3,979 in the second (-2.2%).
Streaming changed from 3,952 to 3,938 RPS (-0.3%) and 3,907 to 3,843 (-1.6%). Streaming P99
ranges overlapped. All measured and warmup response errors and missed arrivals were zero.

React buffered throughput changed +0.2% and +0.7%, while streaming changed +3.1% and +7.0%.
The eXact/React ratios therefore changed +0.4% and -2.9% for buffered, and -3.4% and -8.1% for
streaming. This control movement limits attribution of small differences. Streaming worker CPU
per request was approximately 1.1% higher on current in both pairs, including warmup and measurement.
A small source cost remains a candidate. The large historical fetching loss did not reproduce,
and these samples do not establish its cause or justify reverting correctness fixes.

Response sizes matched at 3,899 bytes. The HTML matched exactly after normalizing only compiler
generated element and component identifiers. The host was not reserved exclusively, and peak
capacity, offered-rate demand, Bun, and browser performance were outside this comparison's scope.
`focusedDiagnostics.nodeFetchingRevisionComparison` in the maintained results retains independent
source, dependency, artifact, environment, correctness, pair, telemetry, and response provenance.
The focused comparison does not replace the full charts.

### Branch-start regression investigation

A second controlled October 8, 2026 (UTC) comparison used branch-start source `3cb5a62b`
and current source `719c8e3f`. Each variant rebuilt its runtime, compiler-owned library
components, and comparison participant with its own compiler. Application source, third-party
dependencies, and the current harness were fixed. The comparison passed the same 56 selected
browser checks. Both modes returned 3,899 bytes and equivalent HTML after normalizing only
compiler-generated identifiers.

Ordinary fetching used the reversed revision and framework orders described above. Buffered
eXact throughput changed -2.4% and +4.6%, while its ratio to React changed -2.7% and +2.4%.
Streaming throughput changed +0.6% and +3.1%, with relative changes of +4.9% and +1.3%.
These pairs do not reproduce a consistent ordinary-fetching regression.

Buffered preloaded capacity did reproduce a relative loss. Each capture used two drivers,
10 seconds of warmup, and 15 seconds at each total concurrency of 16, 32, 64, and 128.
Each revision had two fresh reversed framework populations, and the second pair reversed
revision order. eXact's peak fell from 16,999 to 13,571 RPS in the first pair, and from
15,226 to 13,919 in the second. React's peaks changed -6.1% and +2.9%, so the eXact/React
peak ratio fell 14.9% and 11.2%. These ratios compare each framework's own peak, which may
occur at different concurrency. The maintained results also retain the complete curves and
same-concurrency comparisons. All measured and warmup response errors were zero.

Separate sustained-load Node CPU profiles used total concurrency 64, 10 seconds of warmup,
and 20 seconds of measurement with two reversed framework populations. Only the isolated
worker-launch harness was changed to enable profiling. Excluding the first 15 seconds, current
samples attributed approximately 16–17% of elapsed self weight to UTF-8 writes, 4% to hydration
insertion, 4% to JSON serialization, 2–3% to validation, and 3% to garbage collection. Branch-start
profiles had the same leading hotspots. These sampled shares include idle time and profiler
perturbation. They identify work to investigate, not an isolated cause or exact CPU cost per request.

Private bundle experiments tested invocation carriers, property initialization order, JSON escaping,
hydration insertion, and reuse of empty application asset configuration. Paired whole-render
checks used 5,000 warmup renders and 12 alternating blocks of 10,000 renders per implementation
on Node and Bun, with identical output for the fixture. Empty asset reuse reduced renderer
latency approximately 1–6% across those four cases. Subsequent fresh Node request-load pairs
changed eXact throughput by +0.1% and -1.2%, which did not establish a throughput improvement.
The class invocation carrier also reduced throughput in both follow-up pairs. No source change
was accepted. The asset configuration work belongs to the comparison application and was
already present at branch start.

Further private experiments tested child-preparation allocation, component-domain calls, JSON
escaping guards, result accessor construction, and generated-code minification. They did not
establish a consistent improvement. Removing 76 generated sink readiness checks reduced buffered
renderer latency by 5.6% on Node and 1.2% on Bun, but improved Node request throughput by only
0.3% and 0.9% in two reversed pairs. React throughput fell during those captures, inflating the
relative gains. This buffered-only experiment would break streaming and was rejected. A component
must retain its sink calls, with each sink deciding when transport pressure requires suspension.
Removing unreachable continuation labels while retaining those calls was effectively flat in
paired Node buffered and streaming checks. These fixture experiments are diagnostics and do not
provide full compiler/runtime acceptance.

A subsequent committed optimization (`5db717a0`) removes data-property placeholders before
adding the hydrated result's shared own accessors. V8 retains fast properties, while lazy reads,
own-property descriptors, and the ordinary object prototype remain intact. Enumerable data fields
now precede the accessors. Isolated Node construction fell from 903 to 712 nanoseconds per result,
about 21%. Sampled allocations across whole buffered renders fell about 1%. These diagnostics do
not establish equivalent request throughput savings.

Fresh preloaded request checks used total concurrency 64, 10 seconds of warmup, 20 seconds of
measurement, and two reversed framework populations. Node buffered throughput changed -0.6%
and +0.5% in reversed implementation pairs. Node streaming changed +0.7%, Bun buffered -0.3%,
and Bun streaming -1.9%. Their eXact/React ratios changed -5.4%, +1.2%, +1.5%, -1.2%, and -1.5%,
respectively. This does not establish consistent request-performance recovery. Both Node buffered
controls already reached roughly 18,000 RPS without the optimization, so their higher absolute
throughput cannot be attributed to it. The earlier branch-start comparison needs a fresh matched
repeat to determine whether its relative loss persists under current conditions.

The optimized source passed 509 SSR tests, all 56 selected comparison browser checks, frozen ABI
checks, and nine runtime acceptance executions spanning Node, Bun, Deno, workerd, and installed
island adapters. All measured and warmup response errors were zero. Node bundle differences contain
only the two removed placeholder lines. The Bun control reconstructs those lines in the new bundle,
rather than rebuilding archived source. Request captures used a clean tracked worktree, unchanged
React artifacts per runtime, and native loopback. Constructor and allocation diagnostics preceded
the implementation commit. Runtime acceptance tested the same changes before their commit. The
results retain those provenance limits.

The remaining targets are request-local SSR allocations, buffered hydration assembly and UTF-8
materialization, and continuation overhead that preserves sink-owned suspension. Improvements to eXact's
implementation must demonstrate a gain relative to the unchanged framework control. Shared host
or harness improvements alone do not establish recovery. The capacity regression's source cause
remains unresolved. Compiler/runtime isolation, a fresh Bun comparison against branch-start source, browser startup,
and offered-rate demand comparisons remain outside this diagnostic set. The host was not exclusively reserved.

Hydration JSON now escapes only `<`, which prevents closing tags and legacy HTML script-comment
states. U+2028 and U+2029 are valid JSON characters at the script and attribute publication
boundaries. A single search returns the original serialized string when `<` is absent. Otherwise,
one shared regex performs native replacement. This removes the separate Node and Bun algorithms.

October 8 diagnostics compared the compiled serializer from `463eb1e2` with the uncommitted
simplification on Node 26.9.0 and Bun 1.4.2 on the same WSL host. For roughly 4,000-character
state strings, dense-input serialization plus UTF-8 counting time fell approximately 60% on Node
and 65% on Bun. Strings containing many Unicode separators and no `<` were over 90% faster.
Plain ASCII changed +2.8% on Node and -16.6% on Bun, while sparse escaping changed -3.8% and
-25.7%. Negative latency changes are faster. Node sampled allocated bytes fell about 22% for
dense input and were roughly flat for sparse input. Fewer substitutions also reduce output size
when Unicode separators are present. These isolated measurements do not establish request
throughput gains or retained-heap savings. The simplification was committed as `a6cc061e` after
511 SSR tests, 370 hydration tests and nine runtime acceptance executions passed.

A subsequent comparison tested the same `<`-only operation with `indexOf`, `slice` and
concatenation instead of the regex. Both paths produced identical bytes and included UTF-8
consumption. Slicing reduced single-match Node time by about 9%, with no sampled allocation
reduction. For 4,000-character dense input, it increased Node time by 13%, Bun time by 9% and
Node sampled allocation by 7%. At 64,000 characters, dense slicing increased Node time by 9%
and Bun time by 128%. The current regex remains in use. This comparison used three fresh-process
pairs with alternating order and varied synthetic payload sequence values on each call. An
unchanged 495-character hydration payload and ASCII inputs supplied no-match controls. Their
variable timings limit interpretation of small changes because both escaping paths were bypassed.
Bun allocation volume was not measured. These results concern serialization and consumption,
not whole-request throughput.

Each serialization case used two reversed fresh-process populations, 5,000 warmup calls and six
blocks of 20,000 calls, reduced to 5,000 per block for dense inputs. Allocation sampling used
20,000 calls at a 32 KiB sampling interval and included collected objects. Output checks covered
property names, Unicode, lone surrogates, HTML parsing and repeated calls. Earlier whole-render
checks remained mixed. Identical-code controls exposed 3–5% bias when importing two complete bundles
into one process, and fresh-process controls also varied by several percent. Small renderer
differences from those methods do not establish a gain. Shared hydration-slot splitting remained
mixed. A shared callback for all three original substitutions increased dense-input time by 22%
on Node and 107% on Bun. Three-character slice assembly increased Bun dense-input time by 150%.
Guarded and selective versions of those three substitutions also showed no consistent advantage.
Escaping remains context-specific and precedes output assembly. Component writer calls and
sink-owned suspension remain unchanged. Request-load captures used native loopback in a private
network namespace.

`focusedDiagnostics.branchStartRegressionInvestigation` retains the compact results, source and
artifact identities, methods, correctness checks, prototype limitations, and unexplored scope.
The full comparison charts retain their independent measurement dates and source provenance.

### Matched streaming follow-up

An isolated rebuild of `9478032b` was compared with current source at `fe5d409b`, which has
the same runtime implementation as the full capture at `d0f281ae`. The baseline's Bun
implementation is also identical to the previous Bun capture at `063d1dac`. Each workload
ran baseline/current and then current/baseline, with fresh processes and reversed framework
order. Node demand samples retained 30 seconds of warmup and 60 seconds of measurement.
Both revisions passed their browser correctness checks. The comparison used native loopback,
without a fresh reboot or an exclusive-host guarantee.

Bun ordinary-fetching throughput was effectively unchanged: 4,123 RPS baseline and 4,125
current, with means of 7.74 and 7.73 ms. P99 ranges were 17.14–17.18 and 16.77–17.14 ms.
React also stayed close, and the eXact/React throughput ratio changed by -0.3%. The historical
8.7% eXact loss did not reproduce as a revision difference.

Bun concurrency 32 depends on how the workload reaches that point. A shorter isolated test
measured 10,914 RPS baseline and 10,648 current, a 2.4% loss, or 5.7% after accounting for
React's movement. Repeating the exact full-sweep stages through concurrency 32 instead measured
10,143 RPS baseline and 10,239 current, a 0.9% gain, or 1.6% relative to React. This second
comparison retains the preceding concurrency-16 measurement and its effect on scheduler state.
Neither plan reproduced the full capture's 20% loss. The direction changed with load history,
so these samples do not establish a consistent recent-code regression.

Node streaming at 10,000 offered RPS also produced wide tails on the older code. Baseline
P99 ranged from 32.27 to 49.98 ms, and current ranged from 13.38 to 47.84 ms. Baseline mean
was 5.50 ms, compared with 6.24 ms current. Completed rates were 9,989 and 9,982 RPS, with
0.10% and 0.18% capacity misses. Neither eXact revision recorded response errors. Current
P50, P75, and P95 ranges overlap baseline, but its upper P75 and P95 remain higher. The
better current P99 range alone does not establish an improvement. React overloaded in both
revisions, so its throughput ratio is not a useful normalization for eXact near the offered-rate
ceiling. The older 9–10 ms P99 is not recovered simply by returning to that source revision.

`focusedDiagnostics.streamingRevisionComparison` in the maintained results retains means,
all four percentile ranges, missed demand, errors, control measurements, source identities,
lockfile hashes, artifact hashes, and load plans. These focused tests did not replace the charts.
The current full capture supplies the streaming capacity charts.
This evidence does not justify reverting correctness fixes or changing the scheduling policy.
Smaller workload-dependent differences remain possible. Any further investigation should trace
policy decisions and host scheduling alongside these exact load histories, rather than infer a
cause from separate full-run captures.

### Node streaming scheduling investigation

The Node ordinary-fetching investigation kept the current application, renderer, dependencies,
and fetch service fixed, changing only the adapter's streaming admission policy. Two reversed
pairs measured 4,260–4,324 RPS with the earlier fully batched policy and 3,689–3,785 RPS with
the earlier budget-only work window, an 11–15% loss. Mean latency increased from 7.38–7.49 to 8.43–8.65 ms.
Worker CPU cost increased from approximately 0.29 to 0.32–0.33 ms per request, while GC time per
request remained similar. Data loading increased from 3.53–3.59 to 4.32–4.47 ms.

This fixture fetches its data before entering SSR. The work window permits some ready renders
to execute directly in fetch-completion callbacks, where the earlier policy queued them together.
A separate trace showed both adaptive gates predominantly selecting scheduling. An ablation
retained the window's clock and reset bookkeeping but queued every enabled streaming checkpoint.
That recovered throughput to 4,115–4,179 RPS, compared with 3,704–3,768 RPS for the budget-only policy
in the same reversed pairs. Lost batching is therefore the main demonstrated cause, rather than
the bookkeeping alone. This experiment does not identify individual networking or V8 CPU costs.

Node now retains fully batched streaming as a candidate in the same adaptive controller,
alongside budgeted streaming. The earlier controller compared budgeted scheduling with immediate
execution and could select it even when full batching would perform better. Comparisons use the
existing observer and completion epochs, with settling windows and controls on both sides.
Interrupted comparisons restore the incumbent, and idle traffic resets the choice.

The selector's focused ordinary-fetching comparison measured 4,177–4,229 RPS against
3,723–3,771 RPS for the budget-only control. Mean response time fell from 8.46–8.57 to
7.54–7.64 ms. A preloaded 10,000-RPS guard sustained demand for both variants. The selector's
P99 was 5.80–9.09 ms, compared with 9.55–9.97 ms for the control. Mean latency ranges overlapped
at 1.12–1.23 and 1.20–1.22 ms respectively. These are reversed, same-host diagnostic pairs,
not a replacement for the full benchmark capture. The candidate was built from uncommitted
source, with source and emitted-artifact identities retained explicitly.

`nodeStreamingFetchComparison` in [results.json](performance-baselines/results.json) retains
source substitutions, artifact identities, distributions, telemetry summaries, and limits.
All compared responses were identical, with no measured errors. Adapter tests, SSR resumption
tests, and Node/Bun/Deno/Cloudflare acceptance passed. The subsequent full comparison supplies
the current charts. These earlier matched diagnostics retain their own source identities.

The scheduling changes let Bun yield between queued render batches and give Node progressive
rendering a shared half-millisecond work window while adaptive scheduling is active, with the
fully batched candidate described above. The work
window is shared with Bun. Initial request admission, cancellation, output ordering, and response
ownership retain their contracts. The earlier matched evidence in `ssrSchedulingComparison` in
[results.json](performance-baselines/results.json) isolates the streaming improvement and smaller
buffered-tail cost more directly than comparisons between full runs. Adapter tests, native Bun
tests, and Node/Bun/Deno/workerd runtime acceptance passed for those changes.

The cause of the much lower historical tails is not fully established. Earlier-document source
substitutions also failed to reproduce those timings under matched current dependencies and
runtimes. Replacing callback-based hydration-slot replacement with slices reduced render-only
CPU cost without establishing a network-tail improvement. `ssrDocumentComparison` retains those
source identities, failed attempts, measured distributions, and limits. Neither that optimization
nor this refresh explains the entire historical timing gap.

### Choosing a measurement scope

The latest full run took about 96 minutes. Fixed
sustained-load windows dominate the cost. Running load generators concurrently on the same
machine would make measurements compete for resources.
For a targeted change, a matched before/after comparison of the affected workload provides
stronger attribution than repeating the full matrix against an older capture. Focused results
retain their own source identity and do not replace unmeasured groups in the published charts.

Earlier matched traversal experiments reduced individual hydration-operation costs without a
repeatable whole-page navigation improvement. Loading-strategy experiments also showed why load
alone is insufficient: immediate dynamic import with preload advanced the load event while paint
and service readiness became later. Header-only preload and moving the normal module script to
the body with head and response-header preloads supplied no benefit in those cold-loopback
comparisons. Their bounded summaries and limitations remain in the maintained results.

The current after-load policy leaves the SSR document available while delaying bootstrap loading.
It does not add JavaScript preload hints. Applications can select normal bootstrap loading when
earlier activation is more important. Neither loading policy guarantees that an arbitrary click
before handlers attach will succeed. Cold local measurements do not establish warm-cache, CDN,
or slower-network performance.

### Additional release checks and theme cost

The standard release performance profile passed its reactive/DOM, framework client/server,
compiler workflow, theme, DevTools, and React compatibility checks. Collection transactions,
Node/Bun server diagnostics, transport/build-host diagnostics, and React adapter measurements
also completed. The full shipping heap and allocation guards passed at `f50443c4`.
The isolated compiler corpus passed correctness, structural checks, and the unchanged 1.5×
timing warning limit. Workbench incremental-edit timing was 93.48 ms against the 63.44 ms
historical baseline, or 1.47×. The preceding full capture warned at 1.87× and 1.92× in its two
checks. This repeat did not replace the baseline or change the compiler implementation.
Shipping cold compilation was 1,665.83 ms (0.92× baseline), and incremental editing was
215.18 ms (0.58×). The matched-project cold worker-time ratio was 0.88× overall. These checks
do not establish performance for every feature combination or explain historical timing movement.

The themed shipping fixture now reuses validated immutable palettes and system-preference CSS
across equivalent scopes. Both caches are bounded. Component state, children, preferences, and
cleanup remain independently owned. On clean revision `62204d10cd2918058d0943b90ebc999a77028037`,
the complete heap guard passed 100 warmup renders and five batches of 200 renders with no retained
components or effect scopes. The complete allocation guard measured 2.38 MB per request after
100 warmups and 200 measured requests, below its unchanged 5.5 MiB ceiling.

A production-bundled shipping probe measured 127 ms for its first render and 3–5 ms for the next
four. Before the repair, the same probe took 622–664 ms on every render. This small in-process
probe separates cold generation from reuse, but does not measure sustained request capacity.
The initial abbreviated allocation diagnostic estimated 1.84 GB per request. It established a
failure, but its shorter sampling protocol does not provide a matched full allocation baseline.
The maintained theme guard now measures fresh system scopes, warmed resolution, and cold resolution
separately. The incident-dashboard charts use static styling. Their current capture includes the repair
but does not measure this theme workload.

The initial compiler corpus capture flagged incremental-edit times for Workbench and the
microfrontend portal. Workbench's warning did not recur in matched reruns. Profiling the portal
identified unnecessary contextual type checking of call arguments whose receiver binding was
already unknown. Revision `205dc57d` identifies possible receivers first, while retaining type
checks for mutable receiver ownership and preserving access-path metadata.

Two reversed populations, each with three cold and three incremental samples, compared the old
and new compiler binaries against the same 385-file, 28-project corpus. The portal's median edit
times fell from 133–141 ms to 72–74 ms. Both new-compiler populations passed the unchanged corpus
timing budget. Generated code, source maps, diagnostics, and analysis metadata matched for all
385 files. This optimization changes compiler work without changing emitted runtime behavior.
The tracked September 1 baseline came from Windows and Node 24, so the same-host comparison
provides stronger evidence than the historical ratio alone. The tracked baseline was not replaced.

The maintained results record source identities, commands, sample counts, limits, and both
comparison orders. Theme verification also covers installed packages through Vite, Bun, and
Webpack, browser preference changes and JavaScript-disabled SSR, plus native Node, Bun, Deno,
and workerd rendering. These earlier repairs addressed the theme memory failures and portal timing warning
from that investigation. The current corpus timing check is recorded above. They do not
establish performance for every application workload.

## Earlier response-path investigations

The preceding full capture, `8546ba40bf178d09c5f5157c6927f531cf22b748`, introduced the public
progressive response API with platform-owned consumption. The observations below retain that
capture's comparison with its predecessor and the source identities of later focused diagnostics.
They do not describe a matched comparison with the current revision.

In that capture, Node wrote produced spans directly to its socket; Bun owned a bounded 32 KiB Web
stream. The authored and compiled components remained common to both runtimes and rendering modes.
Its predecessor used an already-created progressive stream, so the transition also changed the
response ownership workload.

In that earlier comparison, Node streaming improves its eXact/React throughput ratio at
every measured concurrency, including 9.7% at concurrency 128. Bun streaming remains lower at most
points: its ratio falls 8.3% at concurrency 128 and approximately 3% under scheduled demand. Keep those
unfavorable results visible. Matched old/new diagnostics found a smaller, roughly 3% direct Bun streaming
gap. Removing the producer completion wrapper recovered part of it, but also removed required error and
cancellation behavior. Byte-counting and empty-encoding probes did not establish a useful improvement;
correctness-preserving completion rewrites did not improve both reversed samples consistently. The
remaining cost is not fully isolated, and this capture does not establish complete Bun recovery.

The Node string concurrency-64 ratio and Bun string 10k-demand p99 also worsened against the previous
capture, but matched old/new diagnostics did not reproduce those regressions. Node's new path averaged
16,490 RPS versus 15,987 for the old path at concurrency 64. Bun's new string path sustained approximately
9,986 RPS with 47 ms p99 versus 9,967 RPS and 50–56 ms for the old path at 10k offered demand. These
two-population diagnostics use copied control artifacts and modified local bundles, not reproducible
clean-checkout variants. Their bounded summaries and limitations accompany the maintained results.

A subsequent Bun 1.4.2 wire probe found that the 3,963-byte preloaded streaming response uses
`Content-Length`, while a response with a delayed tail already sends the available head with HTTP/1.1
chunked framing. Setting `Transfer-Encoding` or deferring all production did not force chunking for
immediately completed output. Yielding after the first output chunk did, but reduced mean throughput
from 10,473 to 5,643 RPS at concurrency 16 and from 7,969 to 5,536 at concurrency 128. A timer-based
yield was also slower. These two reversed populations used 10 seconds of warmup and 15 seconds per
concurrency, native isolated loopback, and matching decoded response hashes with no request errors.
The variants modify ignored adapter bundles based on `1c7b707675ba01ad43a2b2c75c8831b30b5d860a`;
that revision alone does not reconstruct the prototypes. This diagnostic does not replace the full
capture. Forced framing is not an established remedy for the remaining Bun throughput deficit.

A native Bun direct-stream variant that flushed every chunk also regressed in both populations:
approximately 6,172 versus 10,616 RPS at concurrency 16 and 5,898 versus 8,000 at concurrency 128,
with matching content and no request errors. Flushing only the first chunk failed HTTP preflight;
a concurrent request probe observed duplicate terminating chunks. Native HTTP backpressure and
explicit cancellation worked in the direct-stream probe, but its JavaScript-reader path exceeded
the requested buffer bound. These prototypes were not adopted. Their results do not establish that
all native streaming approaches are slower, or fully explain the existing deficit.

The [September findings](findings/2026-09-performance.md) consolidate consequential measurement
limitations and rejected approaches. Earlier reports remain accessible in
[Git history](https://github.com/techjoshua/exact/tree/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines).
They describe their recorded environment, not current performance guarantees.

Linux jobs must verify native loopback routing and record route and namespace metadata. WSL mirrored
networking can route `127.0.0.1` through virtual Ethernet. Use the
[network isolation recipe](../framework-comparison/README.md#local-benchmark-networking) for the
entire benchmark job. The explicit routed-loopback override is for network experiments only.

Compiler-closed SSR bundle acceptance runs in ordinary Vite, Bun, and Webpack tests as well as
the performance fixture builder. These tests execute scheduled server work, check direct component
ownership, and reject retained generic component or client-reactivity machinery. Server fragment
presentation evaluates contributions when their owning render settles; it does not create client
subscriptions solely to serialize a request. Client projection retains its reactive subscriptions.

## Commands

Run the complete framework baseline after building the repository:

Runtime changes require the full repository build, including package client/server target generation,
before rebuilding benchmark applications. A TypeScript-only incremental core build does not refresh
those target copies. For focused core preparation, `node scripts/compile-exact-package.mjs packages/core`
performs that generation; rebuild the affected benchmark applications afterward.

```sh
npm run benchmark:framework
```

The release performance profile builds the repository first and then runs the framework, reactive,
compiler, DevTools, and React-compatibility benchmarks after the complete correctness admission
sequence:

```sh
npm run performance:check
```

The npm prerequisite runs `release:check`, the isolated Router v6.3 check, Theme Lab browser
acceptance, and the native compiler corpus first. Correctness and structural failures stop before
measurement. A machine-local native compiler timing excess is recorded as non-publishable timing
evidence and warns without discarding the admitted build. Once those checks exit, the performance
profile runs benchmarks against their existing build; it does not repeat the repository build or
TypeScript 7 compatibility pass.

Capture framework measurements locally from a complete Node and Chromium run:

```sh
node scripts/benchmark-framework-performance.mjs --output=.tmp/performance/javascript-framework.json
```

`EXACT_FRAMEWORK_BENCH_SAMPLES` controls independent process samples and defaults to `5`.
`EXACT_FRAMEWORK_BENCH_WARMUPS` controls per-process warmups and defaults to `2`. `--node-only` and
`--scenario=<name>` are diagnostic shortcuts; a run using either incomplete mode cannot write a
tracked baseline. `--keep-temporary` retains generated fixture artifacts only for compiler-output
diagnosis.

The focused reactive command includes the repaired compiled keyed-list DOM gate:

```sh
npm run benchmark:reactive
```

To isolate collection mutation costs, run `npm run benchmark:collections`. It measures ordinary
delete/reinsert, committed transactions, and aborted transactions for 1,000- and 10,000-entry Maps
and Sets. Setup and result verification are outside timing. Each case uses three warmups and ten
samples of 100 operations, without observers. Rollback includes the throw/catch cost and verifies
restored insertion order. Transactional deletion records ordering anchors in linear time; ordinary
deletion retains its constant-time path. This microbenchmark is a cost diagnostic, not an application
throughput estimate or a historical speedup claim.

The reactive benchmark also measures scope-owned deep-chain settlement and an equal-result diamond.
The chain guards affected-graph traversal cost; the diamond verifies that equality prevents
downstream execution while reporting settlement timing alongside the collection scenarios.

The shipping fixture also has a manually invoked retained-heap regression test. It warms the
compiler-generated hydratable SSR root with production marker behavior, forces full collections,
and verifies across 1,000 measured requests that each batch plateaus with zero surviving component
instances or effect scopes. A separate retained-heap ceiling catches unowned retained values:

```sh
npm run test:heap -w @exactjs/sample-shipping-calculator
```

This guard is intentionally excluded from ordinary correctness runs because exposed garbage
collection and process heap measurements are diagnostic, environment-sensitive operations.

The paired allocation-sampling guard profiles collected as well as surviving objects after warmup.
It detects regressions that restore marker-mode VNode fallbacks, reactive wrappers for declarative
module collections, nested subtree flattening, eager response-stream encoding, allocation-backed
UTF-8 validation, or key/entry arrays during attribute traversal:

```sh
npm run test:allocation -w @exactjs/sample-shipping-calculator
```

Dependent-foundation candidates are measured one at a time in isolated Node processes:

```sh
npm run benchmark:performance-foundations -- --scenario=transport
```

The supported scenario names are `transport`, `build-host`, and `pending-runtime`.
The `pending-runtime` scenario measures 250 transactions with 1, 16, or 64 property writes each.
Both direct transaction writes and original helper writes through supplied views are measured.
Staging includes transaction creation and writes, publication measures only committing prepared
journals, and discard measures only releasing prepared journals. Staging and publication report
nanoseconds per write, while discard reports nanoseconds per transaction. Separate measurements
stop a scope containing 2,000 unread or cached computed values, then explicitly read the stopped
values, reporting nanoseconds per computed value. Correctness assertions run outside the timed
regions. These microbenchmarks exclude task scheduling, DOM work, network transport and browser
layout, so they describe the reactive engine rather than end-to-end component latency.
`EXACT_PERFORMANCE_FOUNDATION_SAMPLES` controls outer process samples;
`EXACT_PERFORMANCE_INNER_SAMPLES` controls observations inside each process. Publish only bounded summaries of accepted measurements; keep the production workload as a
before/after guard when it protects a meaningful regression.

The completed render-program, bounded-async-SSR, and hydration-publication experiments remain in
the historical evidence, but their handwritten generic-tree comparators were removed with the
native VNode architecture. Current SSR and hydration coverage uses compiler-produced TSX in the
framework benchmark instead.

## Measurement contract

The framework suite:

- compiles its TSX fixtures through the production Vite adapter rather than branding a handwritten
  benchmark component as a substitute for compiler output;
- treats fixture compilation, component construction, scenario assertions, browser startup, and
  missing structured output as setup failures rather than slow samples;
- records medians, nearest-rank p95, minimum, and maximum values from fresh Node or Chromium
  processes;
- performs warmups inside each sample process so one sample's optimized state and garbage
  collection cannot contaminate another sample;
- records Node, operating system, CPU, Chromium version, sample count, and warmup count;
- reports raw, gzip, and Brotli sizes for built artifacts and representative SSR and operation
  payloads;
- uses portable elapsed-time and heap measurements for release evidence; and
- exposes garbage collection only for the repeated mount/unmount plateau scenario, without making
  an exact engine-specific byte count a pass condition.

Production fixture builds are also repeated in clean Node processes. Their emitted raw and
compressed byte sizes must be deterministic before the suite reports a build baseline.
Framework-comparison applications with separate Vite client/server configs use
`buildExactViteApplication()` so both emissions share one process and native project generation;
measuring two unrelated CLI startups would obscure compiler and emission work.

## Scenario coverage

The reactive suite includes subtree disposal while unrelated paused computations remain queued.
It measures removal separately from queue setup and verifies that unrelated work survives and runs
on resumption. The [focused experiment record](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/scope-disposal-and-compiler-traversal-2026-09-05.md)
retains the empty-queue counter-metrics and the compiler-traversal experiment's inconclusive timings.

| Area                 | Scenarios                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup and mounting | Static and dynamic mount, compiled module evaluation, production fixture build, and raw/gzip/Brotli artifact sizes.                                                            |
| Hydration            | Renderer adoption of matching SSR-style root markers while retaining existing DOM identity.                                                                                    |
| Interaction          | First delegated click, scalar publication, branch replacement, and 1,000-item keyed rotation.                                                                                  |
| Update matrices      | Keyed unchanged/change/sparse/rotation/append/prepend/truncate/splice/replacement, mixed-priority scheduling, and a focused DOM transaction that protects focus and selection. |
| Framework boundaries | Enhancement target reroute, Activity park/reactivate, Suspense settlement, and mixed-tree mount/teardown.                                                                      |
| Component ownership  | Creation/disposal of 2,000 compiled instances, inspectable state/API access, and repeated DOM mount/unmount heap plateaus.                                                     |
| SSR                  | Synchronous trees, CPU-bound async work, I/O-bound async siblings, and progressive first-chunk/completion timing.                                                              |
| Server protocol      | Ordinary operation requests and streaming batches with representative payloads and compressed/uncompressed sizes.                                                              |
| Browser              | Every client/component scenario above in the current Playwright Chromium build, with a new browser process per sample.                                                         |

Server GC telemetry reports unavailable values when the runtime does not advertise `gc` observation
support. Null counts are not zero collections, and comparative GC metrics are omitted when any
participant in the lane lacks observations. Native Bun inspector measurements are separate diagnostics
because enabling the inspector affects throughput. See the
[native GC investigation](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/bun-native-gc-ssr-2026-09-11.md).

The framework comparison additionally records FCP, LCP, long-task count and duration, total
blocking time, element/total/comment/text DOM size at semantic readiness, post-GC JavaScript and
embedder heap, backing storage, retained DOM and listener counts, per-script decoded and executed
bytes, function inventory and invocation counts, and parse/compile/evaluation trace attribution.
Executed bytes use the most-specific V8 coverage range for each source interval, so an uncalled
function body is not hidden by its executed top-level script range and nested ranges are not counted
twice. Coverage is best-effort so V8 optimization remains enabled during percentile timing.

One separate diagnostic pass per framework records sampling CPU profiles for cold startup and the
first optimistic interaction plus sampled allocation sites before and after post-interaction
collection. Those profiles preserve raw V8 nodes and ranked URL/function locations for attribution;
the pass uses a 100-microsecond CPU interval, a 4 KiB heap interval, and 6x CPU emulation for the
interaction capture. Attribution-enabled eXact diagnostics join precise executed coverage to source maps and
retain the bundler's actual per-module rendered lengths. Parsed and compiled function counts remain bundle-level
when Chromium omits source locations. An optional post-GC strong-edge dominator snapshot supports retained-heap
investigation without embedding its large raw snapshot. Profiler overhead is intentionally excluded from latency populations, and
sampled heap bytes are not treated as exact retained-heap accounting.

The separate `measure:heap` collector produces balanced, unprofiled post-claim snapshot categories
for the documentation's stacked heap chart. Its arithmetic category means reconcile to mean snapshot
self-bytes, including native nodes; they do not partition the separately measured JavaScript heap
scalar. Capture and publication instructions are in [framework comparison](framework-comparison.md).
The [2026-09-06 capture](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/framework-comparison-heap-composition-2026-09-06.md)
retains the raw rounds, classification rules, and interpretation.

The hydration scenario intentionally measures adoption separately from SSR generation. SSR output
size and generation cost have their own scenarios, which keeps the two costs attributable.

Hydration-publication reports separate application-payload, framework-envelope, and whole-response
sizes. Component names, boundary identities, prop schemas, and prop values are application data;
they are not charged to framework size merely because the compact representation stores them in a
response table. Whole-response raw/gzip/Brotli sizes remain required transport counter-metrics so
an envelope optimization cannot hide an application-facing network regression.

## Baseline and regression policy

The tracked JSON is authoritative measurement evidence for its recorded environment. Compare a
candidate on the same machine and software versions when possible. Investigate changes in the
primary metric together with bundle, payload, heap, and tail-latency counter-metrics; do not accept
a gain that merely moves work into startup or retained state.

The compiled 1,000-item DOM rotation remains a coarse safety gate at a 2,000 ms p95. That generous
limit detects construction failures, runaway reconciliation, and gross regressions without
pretending noisy local timing is a precise cross-machine budget. Add tighter release budgets only
after repeated baselines establish normal variance on supported environments.

Allocation experiments should report both their focused representation measurement and a
production-compiled DOM fixture. Empty scope or component populations isolate baseline ownership
cost, while static, mixed-lifecycle, and keyed-list fixtures detect work shifted into mounting,
patching, or teardown. Do not compare a candidate directly with an older tracked scenario when
intervening renderer features materially changed that workload; first establish a current
same-tree baseline or describe the result as cumulative.
