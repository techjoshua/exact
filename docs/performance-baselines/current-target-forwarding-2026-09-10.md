# Existing render-target forwarding, September 10, 2026

Status: integrated with correctness coverage. A follow-up allocation capture confirms lower allocation in the integrated build. Fresh HTTP comparisons remain pending. Timing screens are mixed. The overall React comparison goal remains unmet.

## Change and hypothesis

Prepared server programs previously created two forwarding closures to retain the operation target for child rendering and sibling preparation. The writer now retains the existing target and installs shared forwarding functions. Each output still owns its preparation lifetime. The target is not a new wrapper, and no WeakMap or additional rendering engine is introduced. Components keep using the same callable output and sink interface.

The hypothesis is that removing two closures per prepared program reduces short-lived allocation and potentially GC work. A few percent reduction in total sampled allocation is plausible for these fixtures; neither fewer collections nor higher HTTP throughput follows automatically. This revisits the mechanism explored in [the earlier application-target experiment](application-target-2026-09-09.md) against the current shared renderer.

Two prototypes were measured. The first stored either a callback or a target in the render field and branched when rendering a child. The selected version keeps that field callable and uses a separate target field with shared functions. Source integration additionally keeps sibling-preparation details behind a method on the owning operation target instead of accessing its private fields from the forwarding helper. That difference requires an integrated-build measurement before transferring the prototype's numbers to production source.

## Allocation evidence

Node 26.8.1 production processes perform 50,000 warmups and 10,000 sampled renders. Inspector sampling uses a 16 KiB interval and includes minor-collected and major-collected objects. Each experiment has two reversed orders for each fixture, with a fresh process per population. Complete document hashes match. Figures are estimated allocated bytes per render, not retained memory, exact object counts or native allocations.

| Prototype | Fixture | Control mean | Candidate mean | Reduction |
| --- | --- | ---: | ---: | ---: |
| Callback-or-target field | 3 incidents | 71,729 | 69,015 | 3.8% |
| Callback-or-target field | 96 incidents | 540,214 | 523,236 | 3.1% |
| Callable field | 3 incidents | 72,074 | 69,497 | 3.6% |
| Callable field | 96 incidents | 539,730 | 525,076 | 2.7% |

Both pairs improve in each row. Callable-field small pairs are 72,038 to 69,296 and 72,110 to 69,697. Large pairs are 539,709 to 525,138 and 539,750 to 525,014. No GC collection-count or pause-duration measurement has been completed for this change.

## Timing evidence

Response-consumption screens use Node 26.8.1 and Bun 1.4.2, 50,000 warmups and 20,000 measured iterations. Each iteration renders the complete application-owned document, creates a Response and awaits text consumption. These screens use the frozen server bundle in both runtimes and do not measure either HTTP adapter. Four asset tags and the complete output are preserved. Workstation activity limits timing confidence.

Mean microseconds per iteration:

| Runtime | Fixture | Control | Callback-or-target | Callable |
| --- | --- | ---: | ---: | ---: |
| Node | 3 incidents | 45.73 | 47.20 | 43.16 |
| Bun | 3 incidents | 36.63 | 36.16 | 36.10 |
| Node | 96 incidents | 204.24 | Not measured | 208.32 |
| Bun | 96 incidents | 258.18 | Not measured | 257.39 |

Small Node callable pairs are 50.16 to 41.41 and 41.31 to 44.91. Small Bun pairs are 37.45 to 36.36 and 35.82 to 35.85. Large Node pairs are 207.79 to 192.22 and 200.70 to 224.41. Large Bun pairs are 280.62 to 259.33 and 235.75 to 255.44. All populations remain evidence, including regressions. These results do not establish a universal timing improvement.

## Correctness and remaining validation

The preceding validation run passed 358 SSR tests in 56 files, test typechecking, the SSR build, targeted formatting and lint, source architecture and JSDoc checks. Frozen 0.5.0 artifacts passed SSR, hydration, client tasks, reactive updates, keyed identity and disposal against the new runtime. No compiler helper signature or artifact semantics were changed, and frozen artifacts were not regenerated.

Saved browser logs record 14 passing checks in each Node/Bun string/stream configuration, 56 total across both frameworks. Integrated forced-suspension probes compare three concurrent requests per fixture and mode against the frozen control in each runtime. All 24 complete-output comparisons pass. Per runtime, the small string/stream groups induce 183/105 suspensions and the large groups induce 1,113/663.

The first package-content, release-ABI, explicit-any and platform-boundary command's terminal output was not retained after context rollover. After confirming its processes had exited, the checks were rerun successfully. Package contents pass, the release ABI remains epoch 1 at 0.5.0, the explicit-any ratchet passes at 73/73, and all five configured platform-boundary bundles pass. This follow-up result supersedes the unverified status preserved in the original evidence archive.

The user began using the workstation, and further load tests were deferred. A subsequent capture ran one Node process at a time with below-normal priority and confirmed the integrated allocation reduction. GC measurements relative to this change's preceding control and fresh Node/Bun HTTP comparisons remain outstanding. Public behavior is unchanged; engineering ownership documentation was updated, with no application-facing documentation change required.

## Integrated allocation follow-up

The [direct-execution-target follow-up](direct-execution-target-2026-09-10.md) includes the frozen preceding build, this integrated build and a new isolated prototype in two reversed orders. The same 50,000-warmup, 10,000-render, 16 KiB sampling method is used, including collected objects. All processes report priority 10. Elapsed render times are not used as performance evidence.

Estimated bytes per render fall from 71,942 to 69,773 on the small page (3.0%) and from 540,419 to 524,827 on the large page (2.9%). Both pairs improve for both fixtures. These measurements confirm the source integration independently of the earlier prototype; they do not establish HTTP throughput or GC pause reductions. Raw profiles are preserved in the follow-up allocation evidence archive.

## Artifacts

Control Node SHA-256: `1712c0d2d246c15c1cc95c638c76ffe4be66f6e482bb34640b345c7ef0e6f4a7`.

Callable prototype SHA-256: `85b0d388f7c2f6dcb587ecde778975f2a8770ca58279849d38c9417011378619`.

Integrated Node SHA-256: `6d92194f2ee395f4e4e5267b8719bc1160a96ce7bc16f1a6bbdc74f98aba4997`.

Integrated Bun SHA-256: `1f0d567e98d162422256e57b1fa8c1192f0d3c02e4c8ac9cf5c0f4d48e82c544`.

The integrated snapshots match the current application server artifacts at report creation. `current-target-forwarding-2026-09-10-evidence.zip` preserves raw populations, allocation profiles, builders, runners, frozen bundles, source snapshots and saved browser/suspension results. The prepared integrated allocation runner is included for reproducibility; no result file is claimed for that unexecuted capture.
