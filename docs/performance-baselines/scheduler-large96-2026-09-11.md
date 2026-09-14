# Scheduling with 96 incidents, Node and Bun

Hypothesis: render-start scheduling continues to help with larger documents, but its relative gain shrinks as per-request rendering and output take more time. The source scheduler prefers node:timers/promises scheduler.yield and retains per-request cancellation. All participants render their complete authored documents. React is unchanged.

The controlled service fixture is expanded from three incidents to 96 at initial data load, cycling the original three records with distinct IDs inc-100 through inc-195. Both frameworks receive the same data. Preloaded input data is reused as in the earlier diagnostic; HTML and hydration are rendered for each request. Each mode runs fresh eXact/React/React/eXact workers, ten-second warmup and five-second blocks at concurrency 32. eXact runs immediate/scheduled/immediate with averaged controls. Node uses node-http; Bun uses native bun-fetch. Workstation load may vary.

| Runtime | Mode | Repeat | Immediate RPS | Scheduled RPS | React RPS | vs immediate | vs React |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| node | string | 1 | 3,334 | 3,884 | 3,575 | +16.51% | +8.63% |
| node | string | 2 | 3,227 | 3,836 | 3,508 | +18.88% | +9.34% |
| node | stream | 1 | 3,008 | 3,352 | 1,461 | +11.45% | +129.44% |
| node | stream | 2 | 2,928 | 3,311 | 1,483 | +13.09% | +123.25% |
| bun | string | 1 | 2,929 | 2,526 | 2,988 | -13.76% | -15.46% |
| bun | string | 2 | 2,813 | 2,461 | 3,014 | -12.54% | -18.35% |
| bun | stream | 1 | 2,573 | 2,737 | 2,095 | +6.36% | +30.66% |
| bun | stream | 2 | 2,601 | 2,756 | 2,088 | +5.96% | +31.99% |

460,631 complete measured responses validated with zero errors. Scheduler call counts include the expected driver identity preflights. Participant and dependency artifact guards pass. Document sizes and full raw distributions are preserved in the summary and capture files.

Scheduling remains opt-in. These loaded measurements do not establish sparse-traffic latency or browser paint effects. The optimization objective remains open pending the remaining checks and any gaps shown here.
