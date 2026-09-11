# Large native Bun string HTTP profiles

Hypothesis: the scheduling slowdown for 96 incidents includes extra runtime CPU or allocation-related work, rather than solely delayed socket delivery. Six fresh processes run immediate eXact, scheduled eXact and unchanged React, then reverse that order. Each uses Bun --cpu-prof for its entire process, five seconds of HTTP warmup and ten seconds of measurement at concurrency 32. Native Bun responses contain full authored documents and hydration.

| Profile | Measured RPS | Process CPU us/request | Samples without a named frame |
| --- | ---: | ---: | ---: |
| exact-immediate-1.cpuprofile | 2,572 | 466.6 | 0.00% |
| exact-scheduled-1.cpuprofile | 2,369 | 572.1 | 37.84% |
| react-1.cpuprofile | 2,759 | 440.0 | 0.00% |
| react-2.cpuprofile | 2,752 | 448.6 | 0.00% |
| exact-scheduled-2.cpuprofile | 2,352 | 582.2 | 35.56% |
| exact-immediate-2.cpuprofile | 2,593 | 450.8 | 0.00% |

The profiler perturbs throughput; these RPS values do not replace unprofiled benchmark results. Process CPU is measured over the HTTP block and includes runtime/background/profiling work. Sample percentages cover startup, warmup and measurement, and are sample-count proportions, not exclusive CPU percentages. Both scheduled profiles contain many leaf samples with an empty function and URL directly beneath the root. That stack supplies no evidence distinguishing garbage collection, scheduling, native work or waiting. The generic GC observer reports zero events here, which does not establish absence of Bun GC.

Immediate eXact attributes roughly 7-8% of samples to startsExactDocument and 9-10% to validatePositionalValue. These are named leads for focused experiments. React attributes about 18.5% to its native Response constructor; comparison by percentages alone is not a per-request cost estimate. The shared renderer is retained.

154,126 complete measured responses validated with zero errors; invocation counts and artifact guards pass. The archive preserves all six raw profiles, HTTP captures, analysis and runner source. No production implementation changed for profiling.
