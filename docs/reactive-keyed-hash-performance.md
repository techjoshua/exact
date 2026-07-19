# Reactive keyed-collection hash performance

This report records the before-and-after measurements for keyed collection hash metadata. The benchmark isolates reactive reconciliation from construction of the incoming snapshot; the protocol scenario includes encoding, JSON serialization, parsing, and decoding.

## Environment

- Date: 2026-07-17
- Baseline commit: `f2491ee170515905c4fb6a5492c6055ce6de76e9`
- Node: 24.11.1
- npm: 11.6.4
- OS: Windows 10.0.26200
- CPU: AMD Ryzen 7 8745HS with Radeon 780M Graphics
- Collection size: 10,000 records
- Warmups: 3 per scenario
- Measured samples: 10 per scenario

## Baseline

| Scenario                                |    Median |       p95 |   Raw payload |
| --------------------------------------- | --------: | --------: | ------------: |
| Unkeyed identical refresh               | 167.77 ms | 330.82 ms |             — |
| Keyed identical refresh                 | 157.45 ms | 328.23 ms |             — |
| Keyed one-item change                   | 254.79 ms | 336.71 ms |             — |
| Keyed one-percent change                | 272.48 ms | 440.81 ms |             — |
| Keyed rotation                          | 273.14 ms | 396.26 ms |             — |
| Keyed add-delete                        | 252.58 ms | 268.94 ms |             — |
| Local mutation then matching fetch      | 246.71 ms | 335.32 ms |             — |
| 100 local mutations then matching fetch | 248.87 ms | 356.66 ms |             — |
| Keyed protocol roundtrip                | 154.88 ms | 300.36 ms | 762,781 bytes |

The baseline recursively compares every retained keyed item. Key registration improves identity matching, but does not avoid structural traversal when the incoming data is equal.

## Optimized

Implementation commits measured: `f797a39`, `4e7d9e6`, `5991f5a`, `36ccd19`, and `dbce1d4`.

| Scenario                                |    Median |       p95 | Median change |     Raw payload |
| --------------------------------------- | --------: | --------: | ------------: | --------------: |
| Unkeyed identical refresh               | 142.89 ms | 304.90 ms |  1.17× faster |               — |
| Keyed identical refresh                 |   2.62 ms |   3.02 ms | 60.12× faster |               — |
| Keyed one-item change                   |  91.96 ms | 121.89 ms |  2.77× faster |               — |
| Keyed one-percent change                | 103.28 ms | 141.59 ms |  2.64× faster |               — |
| Keyed rotation                          | 152.07 ms | 161.65 ms |  1.80× faster |               — |
| Keyed add-delete                        | 151.30 ms | 163.40 ms |  1.67× faster |               — |
| Local mutation then matching fetch      |  94.04 ms | 323.97 ms |  2.62× faster |               — |
| 100 local mutations then matching fetch |  93.46 ms | 135.40 ms |  2.66× faster |               — |
| Keyed protocol roundtrip                |  29.33 ms |  38.33 ms |  5.28× faster | 1,181,837 bytes |

The keyed protocol adds 419,056 raw bytes, or 54.94%, for 10,000 string keys, 10,000 128-bit item hashes, and the aggregate hashes. The measurement is deliberately uncompressed; normal HTTP content compression will reduce the repeated envelope and hexadecimal structure.

The identical keyed refresh exceeded its 10× target. The one-item end-to-end scenario did not reach the proposed 5× target because its observer intentionally maps and joins all 10,000 records after the one changed dependency notifies it. A diagnostic split measured the optimized keyed reconciliation write at a 3.31 ms median and the broad observer flush at a 55.91 ms median. Hashing removes the recursive comparison work but cannot skip an observer that genuinely depends on every item. The complete scenario still improved by 2.77×.

During validation, decoded incoming snapshots initially built mutation-owner links for every item. This caused garbage-collection spikes in structural p95 samples. Deferring those links until a snapshot is adopted or registered reduced the final rotation p95 from the 396.26 ms baseline to 161.65 ms and add-delete p95 from 268.94 ms to 163.40 ms.
