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

| Scenario | Median | p95 | Raw payload |
| --- | ---: | ---: | ---: |
| Unkeyed identical refresh | 167.77 ms | 330.82 ms | — |
| Keyed identical refresh | 157.45 ms | 328.23 ms | — |
| Keyed one-item change | 254.79 ms | 336.71 ms | — |
| Keyed one-percent change | 272.48 ms | 440.81 ms | — |
| Keyed rotation | 273.14 ms | 396.26 ms | — |
| Keyed add-delete | 252.58 ms | 268.94 ms | — |
| Local mutation then matching fetch | 246.71 ms | 335.32 ms | — |
| 100 local mutations then matching fetch | 248.87 ms | 356.66 ms | — |
| Keyed protocol roundtrip | 154.88 ms | 300.36 ms | 762,781 bytes |

The baseline recursively compares every retained keyed item. Key registration improves identity matching, but does not avoid structural traversal when the incoming data is equal.

## Optimized

To be recorded after implementation using the same machine and benchmark harness.
