# Browser performance with host render scheduling

Twelve fresh-context samples per participant, runtime, render mode and browser profile, plus one discarded warmup per combination. Participant order rotates each round. Each navigation renders the complete authored document and hydration. eXact immediate and scheduled HTML hashes match. React rendering is unchanged. All samples verify hydration readiness, optimistic claim feedback, settled state, semantic equivalence and absence of browser/request errors.

Local loopback; constrained profile uses 4x Chromium CPU throttling, 40 ms configured CDP latency and 10 Mbps each direction. Cache is disabled. Node uses the comparison browser harness's common response transport. Bun uses native Bun SSR workers behind the existing Node browser asset frontend/proxy, so Node/Bun navigation times are not pure runtime comparisons. No background load.

| Runtime | Render mode | Profile     | Participant     | Median FCP (ms) | Median navigation (ms) | Median ready (ms) | Median optimistic feedback (ms) |
| ------- | ----------- | ----------- | --------------- | --------------: | ---------------------: | ----------------: | ------------------------------: |
| node    | string      | local       | exact-immediate |           42.00 |                  29.15 |             51.15 |                            1.70 |
| node    | string      | local       | exact-scheduled |           44.00 |                  29.40 |             50.95 |                            1.60 |
| node    | string      | local       | react           |           52.00 |                  37.95 |             53.45 |                            1.45 |
| node    | string      | constrained | exact-immediate |          240.00 |                 316.45 |            468.45 |                            8.20 |
| node    | string      | constrained | exact-scheduled |          236.00 |                 316.60 |            467.65 |                            8.00 |
| node    | string      | constrained | react           |          240.00 |                 353.95 |            470.85 |                            7.00 |
| node    | stream      | local       | exact-immediate |           44.00 |                  30.00 |             52.15 |                            1.60 |
| node    | stream      | local       | exact-scheduled |           40.00 |                  29.15 |             49.50 |                            1.60 |
| node    | stream      | local       | react           |           50.00 |                  36.75 |             52.05 |                            1.40 |
| node    | stream      | constrained | exact-immediate |          238.00 |                 328.35 |            473.45 |                            8.10 |
| node    | stream      | constrained | exact-scheduled |          238.00 |                 318.20 |            473.50 |                            8.05 |
| node    | stream      | constrained | react           |          236.00 |                 345.80 |            462.90 |                            6.95 |
| bun     | string      | local       | exact-immediate |           52.00 |                  37.55 |             59.00 |                            1.60 |
| bun     | string      | local       | exact-scheduled |           52.00 |                  36.10 |             58.20 |                            1.60 |
| bun     | string      | local       | react           |           52.00 |                  43.75 |             58.20 |                            1.50 |
| bun     | string      | constrained | exact-immediate |          240.00 |                 316.65 |            464.60 |                            8.30 |
| bun     | string      | constrained | exact-scheduled |          242.00 |                 318.10 |            470.15 |                            8.30 |
| bun     | string      | constrained | react           |          240.00 |                 350.55 |            467.80 |                            7.40 |
| bun     | stream      | local       | exact-immediate |           52.00 |                  38.05 |             60.70 |                            1.65 |
| bun     | stream      | local       | exact-scheduled |           52.00 |                  37.55 |             58.95 |                            1.60 |
| bun     | stream      | local       | react           |           52.00 |                  44.75 |             59.05 |                            1.40 |
| bun     | stream      | constrained | exact-immediate |          240.00 |                 317.45 |            465.80 |                            8.30 |
| bun     | stream      | constrained | exact-scheduled |          240.00 |                 317.15 |            464.30 |                            8.40 |
| bun     | stream      | constrained | react           |          240.00 |                 348.50 |            466.55 |                            7.35 |

288 measured scenarios passed. eXact navigation medians are lower than React in every measured cell. Constrained first paint is broadly tied. Scheduling has no consistent quiet-host browser benefit or penalty. React retains a small optimistic feedback advantage, about 1 ms under CPU throttling. Twelve samples per cell are insufficient for a robust p99 claim.

These are current-build comparisons, not proof that a specific historical navigation regression has been eliminated. The browser frontend topology and measurement conditions must match before comparing older navigation figures.
