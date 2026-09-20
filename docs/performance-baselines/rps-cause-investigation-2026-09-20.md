# RPS drop investigation, September 20, 2026

## Finding

No performance regression caused by the recent correctness fixes was established. The large historical Node ratio loss occurred while the measured eXact renderer, server package, Node adapter, and request harness stayed unchanged. The one Bun server-entry change, adding the required empty response body, does not produce a consistent loss in paired experiments. All correctness fixes remain in place; no speculative runtime optimization was applied.

The measured relative performance losses remain real results under the requested eXact/React ratio measure. They are not proof that changed framework code caused those losses. This investigation narrows the explanation to changed execution costs for the same workload, but does not identify the exact historical host/runtime cause or establish a code fix for the remaining gap.

## Code and workload audit

- The diff from `fdd83651` through `2937d651` is empty for the controlled request harness, both Node renderer entry sources, SSR sources, server sources, and Node/Bun adapter sources. Later publication commit `4a381500` changes only documentation and captured results.
- Generated Node eXact and React entry hashes and framework-owned server/adapter hashes match across the September 19 recovery and September 20 captures. React imports its external runtime; its recorded version, package resolution, and lockfile entry are unchanged, but the historical capture did not hash every external runtime file.
- Compiler task discovery and DOM hydration corrections affect the native/client paths. Shared presentation CSS is absent from the controlled server workload because its client tags are empty. Neither changed the measured controlled Node server bundle.
- The devalue update in `7d368e51` is not imported by either controlled eXact or React renderer. It does not account for these lanes.
- Removing only `body: ""` from the current Bun bundle reconstructs the historical Bun eXact SHA-256 exactly: `3f7ea2b39f54c043613d3bb2292eaf74a79b7c80d99c09562a662b7360d6f909`. The Bun adapter selects `result.stream` before falling back to `result.body`, so the added field does not trigger rendering, serialization, buffering, or additional response bytes.

## Historical Node streaming decomposition

At preloaded c32, the [September 19 recovery](wsl-recovery-final-2026-09-19.md) and [latest full run](correctness-followup-2026-09-20.md) compare as follows:

| Metric      | September 19 | Latest full run | Change |
| ----------- | -----------: | --------------: | -----: |
| eXact RPS   |       10,945 |          10,167 |  -7.1% |
| React RPS   |        3,967 |           5,092 | +28.4% |
| eXact/React |       2.759× |          1.997× | -27.6% |

React therefore contributes substantially to the relative loss. At the latest React rate, restoring the old ratio requires approximately 14,050 eXact RPS, about 38% above the latest eXact rate. Recovering only eXact's old absolute throughput would not recover the old ratio.

Approximate c32 telemetry intervals show React user CPU dropping from about 223 to 181–187 microseconds per completed response and system CPU from 54–55 to 30–33 microseconds. eXact user CPU rises from 80–85 to 89–90 microseconds, with system CPU around 16–17 microseconds. These are whole-worker counter deltas over nearby telemetry boundaries, not precise per-function attribution.

The separate renderer-only diagnostic, without request sockets or fixture fetching, also changed: eXact mean 233 to 178 microseconds; React 177 to 99 microseconds. Response sizes stayed 3,963 and 3,457 bytes respectively. This rules out treating the observed difference as exclusively a socket-path change. Renderer-only profiles and saturated HTTP have different execution histories and must not be combined as additive cost components.

## Bun body-field experiment

Current and reconstructed historical bundles ran under the same current WSL environment. Each capture uses two fresh populations per framework, two independent drivers, reversed eXact/React order, ten seconds of warmup and twenty seconds at total concurrency 32. Normal-loading variants ran current/old, followed by old/current confirmation after the preloaded pair. Each variant includes its own React control. All samples consume and validate complete responses.

| Loading/run           | Response shape          | eXact RPS | React RPS |   Ratio |
| --------------------- | ----------------------- | --------: | --------: | ------: |
| normal-current        | required body retained  |     3,915 |     4,073 | 0.9613× |
| normal-before         | historical body omitted |     3,973 |     4,107 | 0.9673× |
| normal-before-repeat  | historical body omitted |     3,927 |     4,128 | 0.9513× |
| normal-current-repeat | required body retained  |     3,857 |     4,052 | 0.9520× |
| preloaded-current     | required body retained  |     7,232 |     7,772 | 0.9305× |
| preloaded-before      | historical body omitted |     7,140 |     7,786 | 0.9170× |

Keeping the body field changes the normal-loading ratio by -0.62% in the first comparison and +0.07% in the reverse comparison. Comparing the arithmetic mean of the two ratios per variant gives -0.28%. Preloaded rendering favors the current shape by +1.47%. This does not establish a repeatable body-field penalty or justify reverting the correctness fix. No confidence interval or statistical significance is claimed from these small process populations.

## Node execution-placement control

Unchanged production binaries ran the original preloaded plan through c32: ten seconds of warmup, fifteen seconds at c16, then fifteen at c32. Each capture retains both framework-order populations. The middle run pins only the worker main thread to logical CPU 2 using `taskset -pc`; existing background runtime threads and driver/service placement remain unchanged. This is a limited placement experiment, not full physical CPU isolation.

| Placement                    | eXact RPS | React RPS |  Ratio |
| ---------------------------- | --------: | --------: | -----: |
| Unrestricted, before         |    10,692 |     5,014 | 2.132× |
| Main thread on logical CPU 2 |    10,402 |     5,162 | 2.015× |
| Unrestricted, after          |    10,170 |     5,157 | 1.972× |

The unrestricted ratio changes by -7.5% without a code change. The pinned result lies between the surrounding controls. This experiment neither establishes affinity as a remedy nor uniquely attributes the historical drop to CPU migration. It demonstrates that React normalization does not remove all variation in relative execution cost.

## Environment boundary and resolution

The old Node streaming capture began at 2026-09-19T22:26:51.841Z. The Windows WSL configuration was modified at 2026-09-20T00:49:09.677Z and now contains networkingMode=mirrored. The current WSL VM booted at 2026-09-20T00:52:56.000Z. The historical reference therefore predates both this VM boot and the configuration change. CPU frequency, host power state, scheduling, and complete external runtime hashes were not recorded in that capture. The timing of the transition is evidence of changed execution conditions, not proof that mirrored networking caused the loss.

Keep the task, hydration, and Bun response-contract fixes. Neither the isolated body rollback nor the main-thread placement control establishes a performance remedy. Do not disable hydration validation, streaming backpressure, request cancellation, or adaptive admission to recreate a historical number. Earlier [SSR recovery experiments](ssr-recovery-investigation-2026-09-19.md) already found that removing admission or changing delivery could regress performance.

A decisive environment attribution requires matched captures on both sides of a deliberately controlled WSL mode/restart transition, with repeated renderer-only and sustained measurements and identical artifacts. That transition was not performed here because restarting WSL terminates the active session and the user-owned docs server. It would also need to distinguish the restart itself from networking mode.

If the old execution conditions cannot be reproduced, recovering the historical ratio is a new optimization target for the current environment, not an established correctness regression to undo. Current profiles identify stream delivery, hydration serialization/validation, and temporary render-object allocation as costs worth targeting. They are candidate areas, not newly proven regressions or demonstrated fixes. Any optimization needs paired fresh-process controls across affected lanes, preserved correctness contracts, and a subsequent full matrix before publication.

## Validation and evidence

7,233,155 complete responses across 36 fresh worker populations and nine focused captures; zero request errors and zero invalid responses. eXact responses match the same 3,963-byte SHA-256 identity in every experiment. All measured production sources and artifacts remain unchanged. Only engineering investigation documentation is added; the latest full-run public charts remain intact.

The [structured analysis](rps-cause-investigation-2026-09-20.json) records exact results, historical cost comparisons, host-transition facts, response identities, and raw capture hashes. The [evidence archive](rps-cause-investigation-2026-09-20-evidence.zip) contains the experiment runners, plans, raw captures, logs, and both Bun bundles.
