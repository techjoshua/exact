# Bun fused positional json

Hypothesis: compiler-shaped positional projection can emit JSON directly while validating, avoiding positional arrays and their later serialization traversal. Expected potential is 5-10% total throughput. Scratch interpreter and seven generated projectors retain shape, ancestry, budget, own-property and finite-value checks but accumulate JSON strings. React is unchanged. Large96 native Bun string, concurrency 32. This direct-envelope diagnostic rejects reactive-collection replacers and object-valued schema-zero cells and is not production-ready.

Ten-second warmup, five-second measured blocks, two fresh-worker repeats with reversed ordering and immediate controls before and after scheduled variants. Machine workload may vary. Full authored documents and hydration are validated by response bytes and SHA-256.

| Repeat | Framework / variant | Policy    |   RPS | Response p95 A / B (ms) | Response p99 A / B (ms) |
| ------ | ------------------- | --------- | ----: | ----------------------- | ----------------------- |
| 1      | current             | normal    | 2,920 | 14.111 / 14.079         | 15.263 / 15.215         |
| 1      | current             | scheduled | 2,492 | 16.511 / 16.623         | 24.383 / 24.047         |
| 1      | current             | normal    | 2,860 | 14.343 / 14.359         | 15.463 / 15.383         |
| 1      | candidate           | normal    | 2,392 | 16.831 / 16.847         | 18.431 / 18.991         |
| 1      | candidate           | scheduled | 2,075 | 22.783 / 22.975         | 28.127 / 31.183         |
| 1      | candidate           | normal    | 2,372 | 17.023 / 17.023         | 18.671 / 18.735         |
| 1      | react               | normal    | 3,040 | 13.255 / 13.255         | 14.111 / 14.111         |
| 2      | react               | normal    | 3,035 | 13.311 / 13.327         | 14.431 / 14.447         |
| 2      | candidate           | normal    | 2,342 | 16.879 / 16.815         | 18.671 / 18.527         |
| 2      | candidate           | scheduled | 2,145 | 21.503 / 18.767         | 28.255 / 25.599         |
| 2      | candidate           | normal    | 2,345 | 16.767 / 16.815         | 17.951 / 18.031         |
| 2      | current             | normal    | 2,912 | 14.039 / 14.007         | 15.495 / 15.311         |
| 2      | current             | scheduled | 2,503 | 16.247 / 17.743         | 21.999 / 23.567         |
| 2      | current             | normal    | 2,890 | 14.127 / 14.135         | 15.151 / 15.239         |

182,108 complete measured responses, zero errors. Percentiles are separate per-driver values, never pooled or averaged. Invocation guards pass.

Candidate throughput regresses substantially in both repeats and scheduling modes. Avoiding intermediate positional arrays does not compensate for repeated primitive serialization calls and JavaScript string construction in this implementation. No production change adopted. This does not prove every possible fused compiler serializer would lose.
