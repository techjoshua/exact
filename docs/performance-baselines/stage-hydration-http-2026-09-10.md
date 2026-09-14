# Current HTTP hydration-publication headroom, September 10, 2026

Hydration publication is a material target on the retained shared renderer. In six short interleaved groups per runtime, bypassing publication improves eXact HTTP string throughput in every group. On Node, the diagnostic removes most of the contemporaneous throughput gap to React. This redirects optimization away from the recent small object-layout experiments. It is not a production optimization, achievable-savings promise or new public benchmark baseline.

## Scope of the diagnostic

The isolated Node and Bun artifacts memoize the first completed renderHydrationScript result. Every request still renders the full application-owned component tree, prepares root props, captures component resumptions, builds publication options, constructs the hydratable result and uses the normal runtime response adapter. The bypass removes hydration metadata construction, positional projection/validation, JSON serialization, escaping, payload byte accounting and script construction after the first request. String output has no separate byte-target argument at this call boundary.

The controlled input remains fixed. Every measured response is validated against its complete participant-specific body hash. Normal eXact and the diagnostic produce identical 4,672-byte documents; React produces its normal 3,660-byte document. All four asset tags are present. There is no padding or omitted document shell. The same cached hydration script would be incorrect for changing state, so this cannot ship. It also changes allocation, string reuse and GC; it is a rough headroom diagnostic rather than an additive decomposition of CPU time.

The earlier hydration headroom report predates the current shared renderer and several retained improvements. Its conclusion was not assumed to describe this build. The current retained Node/Bun hashes are checked by the builder before creating isolated copies. No production framework, application or React code changed.

## Workstation variation and revised measurement

The user is using this PC and explicitly reminded us that load varies between runs. The initial twelve fresh-process populations use ten-second warmups and six-second windows, with normal eXact, diagnostic and React in reversed orders. Their directions are mixed. Node normal changes from approximately 5,966 to 7,642 requests/s; Bun normal changes from 9,720 to 6,612. The first apparent Node gap closure was therefore not treated as a confirmed gain. All original observations are preserved.

The follow-up keeps three independent servers alive for one runtime, warms each for ten seconds and rotates six permutations of normal eXact, diagnostic and React. Each measurement lasts 1.5 seconds. Only the selected server receives benchmark traffic; the other warmed servers remain idle. Two fresh owned load-driver processes provide sixteen concurrent requests each. The service, workers and drivers run at below-normal priority 10. Driver startup is outside its measured stage; fresh connections remain part of each block. Rates divide combined valid completions by the union of driver measurement windows. Node 26.8.1 uses Node HTTP and Bun 1.4.2 uses its separately built native Fetch entry.

Short windows reduce separation between compared variants but do not eliminate machine variation, warm-state effects, idle-server overhead or connection costs. Six permutations expose repeated local directions. These are descriptive local measurements, not confidence intervals or deployment capacity guarantees.

## Interleaved results

| Runtime | Normal eXact req/s | Publication bypass req/s | Normal React req/s | Bypass vs normal eXact |
| ------- | -----------------: | -----------------------: | -----------------: | ---------------------: |
| node    |              6,728 |                    9,409 |             10,145 |                 +39.8% |
| bun     |              8,684 |                   10,135 |              9,160 |                 +16.7% |

| Runtime / group | Normal eXact | Publication bypass |  React |
| --------------- | -----------: | -----------------: | -----: |
| node / 1        |        5,680 |              9,833 | 10,027 |
| node / 2        |        6,292 |              9,399 | 10,099 |
| node / 3        |        6,810 |              9,047 |  9,853 |
| node / 4        |        7,208 |              9,538 | 10,365 |
| node / 5        |        7,280 |              9,339 | 10,202 |
| node / 6        |        7,101 |              9,300 | 10,325 |
| bun / 1         |        8,625 |              9,980 |  9,158 |
| bun / 2         |        8,889 |             10,247 |  9,029 |
| bun / 3         |        8,386 |             10,205 |  9,177 |
| bun / 4         |        8,594 |             10,177 |  8,813 |
| bun / 5         |        8,750 |             10,100 |  9,188 |
| bun / 6         |        8,858 |             10,101 |  9,595 |

All 489,569 measured interleaved responses pass validation with zero errors. Publication bypass improves over normal eXact in all six groups on each runtime. On Node, the descriptive fraction of the local throughput gap removed ranges from 68.2% to 95.5%, calculated as (diagnostic - normal) / (React - normal). This is not a CPU-time fraction or a forecast for a safe implementation. Bun diagnostic throughput exceeds React in all six groups.

## Decision

The previous focus on roughly one-percent representation savings was not sufficiently tied to the largest remaining gap. This stage-level experiment supplies stronger evidence for prioritizing hydration publication on both HTTP string paths. The next bounded investigation should separate positional projection/validation, JSON/escaping and final script construction inside this stage, using current artifacts and short interleaved comparisons. Required behavior and request-dependent publication remain intact in production; unsafe memoization is only the diagnostic control.

No claim is made that all the measured benefit can be retained. Fresh-string allocation and publication of changed state are necessary work. Whole-stage bypass cannot say which substage is dominant, and profile sample shares alone are not recoverable budgets. Production and the overall goal remain unchanged and unmet.

## Evidence

- `framework-comparison/participants/exact/dist-server/server-entry.js`: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
- `.tmp/ssr-large-profile/stage-hydration-node/server-entry.js`: `948e517c333c97597024af381b2d66ceff2a078b5adcf1318a4bec1a063f0883`.
- `framework-comparison/participants/react/dist-server/server-entry.js`: `44914942423c766956063c2d963b8f384b64470ce1da517c44ef66c6a46a754a`.
- `framework-comparison/participants/exact/dist-bun-server/bun-server-entry.js`: `9adc04f4d5d6e78ad95730319a475918c3b4b045da9a93f812c81aa827d60d2e`.
- `.tmp/ssr-large-profile/stage-hydration-bun/server-entry.js`: `2f9cc79e86c23a61e56e30663c62bed246c2ef0976e72f0c7f768702e98f8b96`.
- `framework-comparison/participants/react/dist-bun-server/bun-server-entry.js`: `c626b17de483b079654175da21ebcc77fc8796dbfc954f97210f56d18c83bf43`.

The archive preserves both measurement methods, raw driver results, asserted diagnostic builder, measured entries, harness and relevant publication source. All task-owned processes exited.
