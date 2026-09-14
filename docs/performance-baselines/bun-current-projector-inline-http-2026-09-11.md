# Bun current projector inline http

Hypothesis: inline null/string/boolean checks in generated positional projectors might recover 1-5% in the current Bun HTTP path. Reconsideration follows earlier favorable Bun HTTP and encoded-output results that were rejected because other runtime results were mixed. This prototype changes 37 sites on the current bundle, retains node/depth budgets and generic validation for other values, and preserves the version-one projector contract. Large96 native Bun string, concurrency 32, unchanged React.

Ten-second warmup, five-second measured blocks, two fresh-worker repeats with reversed ordering and immediate controls before and after scheduled variants. Machine workload may vary. Full authored documents and hydration are validated by response bytes and SHA-256.

| Repeat | Framework / variant | Policy | RPS | Response p95 A / B (ms) | Response p99 A / B (ms) |
| --- | --- | --- | ---: | --- | --- |
| 1 | current | normal | 2,882 | 14.327 / 14.335 | 15.807 / 15.727 |
| 1 | current | scheduled | 2,489 | 16.335 / 19.359 | 22.815 / 25.215 |
| 1 | current | normal | 2,889 | 14.023 / 14.007 | 14.807 / 14.815 |
| 1 | candidate | normal | 2,856 | 14.335 / 14.351 | 15.759 / 15.823 |
| 1 | candidate | scheduled | 2,451 | 19.039 / 17.583 | 24.079 / 23.967 |
| 1 | candidate | normal | 2,832 | 14.407 / 14.383 | 15.535 / 15.655 |
| 1 | react | normal | 3,025 | 13.439 / 13.399 | 14.183 / 14.143 |
| 2 | react | normal | 2,985 | 13.599 / 13.615 | 14.663 / 14.751 |
| 2 | candidate | normal | 2,953 | 14.015 / 13.975 | 15.215 / 15.111 |
| 2 | candidate | scheduled | 2,513 | 16.343 / 16.847 | 22.783 / 24.239 |
| 2 | candidate | normal | 2,853 | 14.551 / 14.551 | 15.783 / 15.839 |
| 2 | current | normal | 2,884 | 13.999 / 14.015 | 15.343 / 15.015 |
| 2 | current | scheduled | 2,457 | 16.911 / 16.575 | 23.455 / 22.655 |
| 2 | current | normal | 2,755 | 14.687 / 14.671 | 15.719 / 15.791 |

194,623 complete measured responses, zero errors. Percentiles are separate per-driver values, never pooled or averaged. Invocation guards pass.
