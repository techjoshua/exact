# SSR output wrapper isolation experiment

Date: 2026-09-09. Decision: do not adopt from this evidence.

## Hypothesis and scope

Removing the forwarding `{ segments: output }` object could reduce per-program allocation and
improve rendering time by less than 2%. The prepared invocation wrapper remains necessary to keep
its eager values from being flattened as ordinary children. This experiment removes only the later
forwarding wrapper and adjusts its consumers. It does not change the output array representation,
compiler emission, task execution, escaping, hydration, or the shared rendering engine.

An earlier leaf-direct experiment combined this removal with direct string output. This experiment
isolates the forwarding wrapper on the retained synchronous-callback build.

## Method

Sixteen fresh processes: Node and Bun, string and consumed stream rendering, two reversed-order
pairs per cell. Each population uses 5,000 warmups and 12,000 measured renders of the 96-incident
fixture, NODE_ENV=production, and the same portable bundle across runtimes. Each application renders
its document shell. Client tags are empty. Streams are consumed with Response.text(). These are
renderer timings, not HTTP throughput, early-flush timing, or browser measurements. No React
population was run because this experiment isolates an eXact implementation change.

## Results

Positive means the candidate took longer. Both pairs are shown because two observations do not
support a precise estimate, particularly with variable workstation load.

| Runtime | Mode   | Pair 1 time change | Pair 2 time change |
| ------- | ------ | -----------------: | -----------------: |
| node    | string |             -1.60% |            +13.47% |
| node    | stream |             -0.16% |             -0.79% |
| bun     | string |             -3.39% |             -2.42% |
| bun     | stream |             -3.35% |             +1.50% |

All paired full-document SHA-256 hashes match. Bun strings improved in both pairs, Node streams
were nearly flat, and Node strings and Bun streams were inconsistent. The Node string regression
requires further evidence before adoption; these observations do not prove the wrapper is valuable
or that removing it causes a stable regression. They do not establish an overall performance win.

Production code remains unchanged. No package or browser tests were run for this rejected bundle
prototype. Output equality on this fixture is not a substitute for lifecycle and failure-path
coverage if the change is reconsidered. The overall React parity goal remains unmet.

The accompanying archive contains the frozen control and candidate, worker, builder, runner,
fixed input, raw results, reporter, and a SHA-256 manifest.
