# Output-policy follow-up guards, September 22, 2026

The full capture exposed a higher Bun string 8,000-RPS p99 and unfavorable high-concurrency Node ratios relative to the preceding full capture. These fresh controls test those differences after the full suite, without concurrent measurement workloads. They do not erase the unfavorable full-run observations.

Bun uses the frozen automatic integration candidate and its original adapter control, with identical renderer bundles. The prior integration archive retains those artifacts. Node compares the exact entry SHA from the preceding full capture against the newly built entry. The only Node entry differences are the progressive-only selector and its streaming call site. Node string execution code and the Node adapter remain unchanged. Both APIs are checked. Complete HTML identities and frozen artifacts are verified.

Each capture uses two load drivers and a React comparison. Node uses 10-second warmup and 15 seconds each at total concurrency 64 and 128. Bun uses 30-second warmup and 60-second measurement at 8,000 offered RPS. Candidate precedes control, with React measured first in each capture. RPS includes drain, and p99 ranges describe separate drivers, not confidence intervals.

The fresh Node pairs do not reproduce the full-run high-concurrency losses: all four candidate ratios improve. This is evidence against a reproducible regression from the selector under these guards, not proof that an unused helper made string rendering faster. Both old and new Bun policies produce roughly 14–15 ms p99 at 8,000 offered RPS, reproducing most of the historical increase with the old policy; the candidate is about 0.8 ms higher in this pair. The preceding 6 ms tail is not recovered here, and no precise cause is established for that cross-run shift. The production policy is retained.

| Runtime/API | Stage               | eXact control RPS | eXact candidate RPS | React control RPS | React candidate RPS | Ratio change |    Control p99 |  Candidate p99 |
| ----------- | ------------------- | ----------------: | ------------------: | ----------------: | ------------------: | -----------: | -------------: | -------------: |
| bun/string  | total-arrivals-8000 |             8,000 |               7,999 |             8,000 |               7,998 |        +0.0% | 14.11–14.11 ms | 14.86–14.93 ms |
| node/stream | total-c128          |            11,954 |              13,224 |             4,491 |               4,475 |       +11.0% | 25.84–25.93 ms | 22.77–23.66 ms |
| node/stream | total-c64           |            11,976 |              13,260 |             4,541 |               4,470 |       +12.5% | 13.84–15.70 ms | 13.58–14.25 ms |
| node/string | total-c128          |            15,162 |              16,863 |            12,699 |              11,769 |       +20.0% | 20.88–20.93 ms | 18.16–18.21 ms |
| node/string | total-c64           |            14,997 |              16,466 |            12,730 |              12,207 |       +14.5% | 13.42–13.56 ms | 11.57–13.15 ms |

[Structured results](output-policy-followup-guards-2026-09-22.json) and [raw evidence](output-policy-followup-guards-2026-09-22-evidence.zip). Archive SHA-256: `86a91f4f457783164bfc3fefbbb7271c3e07e1f8d5ddc7760bd892ea1bee0e5c`.
