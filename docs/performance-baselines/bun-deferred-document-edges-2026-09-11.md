# Bun deferred document edges

Hypothesis: preserving the first and last sink writes around the middle rope avoids flattening the entire HTML for document recognition and hydration insertion, potentially recovering 5-10%. Shared component sink API is unchanged. Three output chunks replace one only in the collecting sink; document recomposition uses concatenation. Large96 native Bun string, concurrency 32; current and candidate are frozen compiled bundles, with unchanged React.

Ten-second warmup, five-second measured blocks, two fresh-worker repeats with reversed ordering and immediate controls before and after scheduled variants. Machine workload may vary. Full authored documents and hydration are validated by response bytes and SHA-256.

| Repeat | Framework / variant | Policy    |   RPS | Response p95 A / B (ms) | Response p99 A / B (ms) |
| ------ | ------------------- | --------- | ----: | ----------------------- | ----------------------- |
| 1      | current             | normal    | 2,834 | 14.615 / 14.599         | 16.087 / 15.775         |
| 1      | current             | scheduled | 2,449 | 17.295 / 20.383         | 24.095 / 24.687         |
| 1      | current             | normal    | 2,795 | 14.479 / 14.511         | 15.375 / 15.431         |
| 1      | candidate           | normal    | 2,773 | 14.415 / 14.527         | 15.439 / 15.655         |
| 1      | candidate           | scheduled | 2,492 | 16.975 / 18.383         | 23.679 / 23.695         |
| 1      | candidate           | normal    | 2,705 | 14.719 / 14.727         | 16.639 / 16.247         |
| 1      | react               | normal    | 3,095 | 13.407 / 13.463         | 14.575 / 14.647         |
| 2      | react               | normal    | 3,033 | 13.439 / 13.487         | 14.383 / 14.479         |
| 2      | candidate           | normal    | 2,756 | 14.591 / 14.511         | 15.703 / 15.719         |
| 2      | candidate           | scheduled | 2,469 | 21.103 / 17.167         | 25.919 / 21.999         |
| 2      | candidate           | normal    | 2,789 | 14.647 / 14.575         | 15.799 / 15.983         |
| 2      | current             | normal    | 2,892 | 14.311 / 14.191         | 18.079 / 18.031         |
| 2      | current             | scheduled | 2,425 | 19.359 / 17.791         | 24.751 / 24.703         |
| 2      | current             | normal    | 2,798 | 14.759 / 14.727         | 16.079 / 16.039         |

192,022 complete measured responses, zero errors. Percentiles are separate per-driver values, never pooled or averaged. Invocation guards pass.

Immediate candidate throughput regresses in both repeats, while scheduled throughput improves by about 1.7-1.8%. The immediate path is already the faster option for this workload. No production sink change adopted.
