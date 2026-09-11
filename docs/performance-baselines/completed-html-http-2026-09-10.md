# Completed HTML wrapper HTTP comparison

The integrated completed-HTML result wrapper improves Node string throughput in both observed pairs, but it does not establish a universal gain. Node streaming and Bun string are slightly lower in both pairs. Bun streaming is mixed and effectively flat. The workstation was in active use; these are engineering observations, not a replacement published baseline.

Twenty-four fresh production processes compare the preceding individual-getter build, the current completed-HTML build, and React. Node uses node-http; Bun uses its native Fetch transport and runtime-specific bundle. Each process warms for ten seconds and measures for six seconds using two drivers at concurrency 16 each. Both variant orders are retained. Each measured response is checked against its complete document identity, including full application-owned shells and four asset tags. All populations complete with zero measured errors.

Mean valid requests per second:

| Runtime | Mode | Previous eXact | Current eXact | React |
| --- | --- | ---: | ---: | ---: |
| Node | String | 6,285.6 | 6,606.8 | 9,297.1 |
| Node | Stream | 5,403.3 | 5,322.9 | 3,459.8 |
| Bun | String | 8,144.7 | 8,006.5 | 9,056.4 |
| Bun | Stream | 4,835.9 | 4,825.0 | 4,821.6 |

Relative to previous eXact: Node string +5.1%, Node stream -1.5%, Bun string -1.7%, Bun stream -0.2%. Current eXact trails React in both string modes, leads Node streaming and is effectively tied in this Bun streaming capture. No minimum percentage is used to conceal the regressions or declare the overall goal achieved.

Individual observations, rounded requests/s, are preserved to expose workload variation:

| Runtime/mode | Previous pair 1 / 2 | Current pair 1 / 2 | React pair 1 / 2 |
| --- | --- | --- | --- |
| Node string | 6,569 / 6,002 | 6,786 / 6,427 | 9,767 / 8,827 |
| Node stream | 5,334 / 5,473 | 5,303 / 5,343 | 3,480 / 3,440 |
| Bun string | 6,869 / 9,420 | 6,634 / 9,379 | 7,286 / 10,827 |
| Bun stream | 4,890 / 4,782 | 4,741 / 4,910 | 4,853 / 4,791 |

The current implementation remains in the working source for its simpler completed-value semantics and observed Node string improvement. Its Bun HTTP gap remains unresolved. The response-consumption improvement documented in [the integration report](completed-html-result-2026-09-10.md) must not be substituted for these HTTP measurements.

Control artifact hashes are Node `069f9784fa667af7896202923a6c08622ae1bb3f4060054328314dbe1ae6619b` and Bun `90f60a41d7095afd77765ce5d4abb336ceadd938dc2415355b56a24b989f17f5`. Current hashes are Node `9093d5a3f3fdc1df26aa016be083964eace4f50ddb87766312e813331dd235b3` and Bun `8dade5311d0d8aa001b9275fc28a5f21e61fe48bd03bcff012ed4c484a99ada7`. Controls were restored from the verified earlier evidence archive without rebuilding them. No runtime source changed during the comparison.

Evidence: `completed-html-http-2026-09-10-evidence.zip` contains all populations, identities, errors, frozen artifacts and the owned-process runner. Correctness and package validation remain documented with the source integration; this capture adds HTTP evidence.
