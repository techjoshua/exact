# Result storage cross-mode follow-up, September 10, 2026

Status: the current shared-getter implementation retains a Node string throughput gain, but cross-runtime performance acceptance remains unresolved. The Bun string regression requires further investigation. No production source changed in this capture.

The current individual-descriptor implementation is compared with the frozen closure-based result implementation and React. There are 24 fresh production worker processes: Node/Bun, string/stream, two reversed variant orders. Each process warms for ten seconds and measures for six seconds with two drivers at concurrency 16 each. Every response is checked against its complete document identity. Documents include the application-owned shell and four asset tags. All populations completed with zero measured errors.

Mean valid requests per second:

| Runtime | Mode | Old closure results | Current shared getters | React |
| --- | --- | ---: | ---: | ---: |
| Node | String | 6,690.1 | 7,291.3 | 8,944.6 |
| Node | Stream | 6,062.0 | 6,065.2 | 3,777.2 |
| Bun | String | 9,434.5 | 8,138.1 | 9,829.8 |
| Bun | Stream | 7,741.5 | 7,801.7 | 8,601.3 |

Node string improves 9.0% over the old implementation, with both pairs faster, but remains 18.5% below React. Node streaming is effectively unchanged and retains its lead over React. Bun string is 13.7% below the old implementation, with both pairs slower. Bun streaming is mixed and does not establish a meaningful gain.

Absolute Bun string throughput changed substantially between rounds: old/current/React were 7,912/6,748/9,331 in the first order and 10,957/9,528/10,329 in the reversed order. The workstation is uncontrolled, so these means are observations rather than stable capacity estimates. Both paired Bun regressions remain evidence against treating the earlier near-tie as sufficient acceptance. During the subsequent instance-writer GC investigation the user explicitly reported beginning to use the PC; that report arrived after this HTTP capture completed.

The current Node artifact is `069f9784fa667af7896202923a6c08622ae1bb3f4060054328314dbe1ae6619b`; Bun is `90f60a41d7095afd77765ce5d4abb336ceadd938dc2415355b56a24b989f17f5`. Per-population hashes, identities, driver measurements and errors are preserved in the evidence archive. Earlier correctness validation remains described in [result construction](result-construction-2026-09-10.md). This run adds performance evidence, not another browser or package validation claim.

Evidence: `result-storage-cross-mode-2026-09-10-evidence.zip`.
