# Bun hydration key count

Hypothesis: enumerating and counting own enumerable keys without an Object.keys array might reduce hydration allocation costs and recover 2-5% throughput. Prototype changes interpreter and generated positional projectors only, retains own-property checks, and leaves React unchanged. Large96 native Bun string, concurrency 32.

Ten-second warmup, five-second measured blocks, two fresh-worker repeats with reversed ordering and immediate controls before and after scheduled variants. Machine workload may vary. Full authored documents and hydration are validated by response bytes and SHA-256.

| Repeat | Framework / variant | Policy | RPS | Response p95 A / B (ms) | Response p99 A / B (ms) |
| --- | --- | --- | ---: | --- | --- |
| 1 | current | normal | 2,842 | 14.239 / 14.271 | 15.919 / 15.535 |
| 1 | current | scheduled | 2,408 | 18.591 / 19.487 | 23.839 / 23.967 |
| 1 | current | normal | 2,752 | 14.495 / 14.503 | 15.759 / 15.815 |
| 1 | candidate | normal | 2,664 | 15.119 / 15.159 | 16.279 / 16.431 |
| 1 | candidate | scheduled | 2,361 | 20.591 / 19.423 | 24.655 / 25.775 |
| 1 | candidate | normal | 2,651 | 15.295 / 15.303 | 16.495 / 16.687 |
| 1 | react | normal | 3,025 | 13.423 / 13.471 | 14.495 / 14.503 |
| 2 | react | normal | 3,023 | 13.543 / 13.543 | 14.431 / 14.551 |
| 2 | candidate | normal | 2,697 | 15.095 / 15.079 | 16.735 / 16.655 |
| 2 | candidate | scheduled | 2,329 | 17.695 / 20.815 | 23.903 / 26.303 |
| 2 | candidate | normal | 2,655 | 15.183 / 15.231 | 16.431 / 16.527 |
| 2 | current | normal | 2,894 | 14.063 / 14.055 | 15.255 / 15.271 |
| 2 | current | scheduled | 2,493 | 15.799 / 15.855 | 23.119 / 24.943 |
| 2 | current | normal | 2,720 | 14.807 / 14.855 | 16.511 / 15.783 |

188,038 complete measured responses, zero errors. Percentiles are separate per-driver values, never pooled or averaged. Invocation guards pass.

Candidate throughput regresses in both repeats, in both scheduling modes. Avoiding a temporary array is not automatically faster than the native key enumeration operation. No production change adopted.
