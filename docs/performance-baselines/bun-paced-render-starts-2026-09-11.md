# Bun paced render starts

Hypothesis: staggering starts by one or four microtask checkpoints inside each existing 32-start batch might reduce simultaneous completed-response lifetime and recover 5-15% throughput. Large96 native Bun string, concurrency 32. serial-1 and serial-4 labels mean checkpoint counts here, not batch sizes. Signal-free diagnostic only. React is unchanged.

Ten-second warmup, five-second measured blocks, two fresh-worker repeats with reversed ordering and immediate controls before and after scheduled variants. Machine workload may vary. Full authored documents and hydration are validated by response bytes and SHA-256.

| Repeat | Framework / variant | Policy       |   RPS | Response p95 A / B (ms) | Response p99 A / B (ms) |
| ------ | ------------------- | ------------ | ----: | ----------------------- | ----------------------- |
| 1      | exact               | normal       | 2,876 | 14.359 / 14.367         | 15.447 / 15.823         |
| 1      | exact               | scheduled-32 | 2,488 | 16.071 / 17.647         | 22.495 / 24.847         |
| 1      | exact               | serial-4     | 2,054 | 19.423 / 19.663         | 20.879 / 25.647         |
| 1      | exact               | serial-1     | 2,234 | 18.783 / 18.415         | 24.831 / 23.183         |
| 1      | exact               | normal       | 2,563 | 15.335 / 15.367         | 16.767 / 16.687         |
| 1      | react               | normal       | 3,039 | 13.647 / 13.639         | 14.583 / 14.687         |
| 2      | react               | normal       | 3,020 | 13.855 / 13.903         | 14.839 / 14.951         |
| 2      | exact               | normal       | 2,869 | 14.575 / 14.495         | 15.567 / 16.015         |
| 2      | exact               | serial-1     | 2,211 | 20.207 / 18.815         | 27.071 / 24.431         |
| 2      | exact               | serial-4     | 2,156 | 18.831 / 19.375         | 20.735 / 24.591         |
| 2      | exact               | scheduled-32 | 2,432 | 18.175 / 18.959         | 25.503 / 23.839         |
| 2      | exact               | normal       | 2,825 | 14.719 / 14.679         | 15.951 / 15.927         |

154,241 complete measured responses, zero errors. Percentiles are separate per-driver values, never pooled or averaged. Invocation guards pass.

Pacing loses throughput relative to the current scheduled policy in both repeats, and both remain slower than immediate rendering on this workload. No production change adopted.
