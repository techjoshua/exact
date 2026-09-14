# Bun admission scheduling recheck, September 11, 2026

Diagnostic only. Native Bun still ships with immediate admission. This experiment uses the current
`15436b9a` application artifacts and unchanged renderer. It adds a scheduling point before the native
Fetch participant handler. The earlier Bun experiment used the renderer-level scheduling hook and a
lag-only controller; its rejection does not decide this distinct admission experiment.

Hypothesis: batching request starts may recover networking time and reduce queueing under demand.
The expected modest gain was exceeded in this small-document fixture. A single scheduled callback
per request is a control for the effect of batching. This is not yet an adaptive-controller test.

Production Bun 1.4.2, two independent Node load drivers, full response hashes, and reversed policy
order. Each fresh worker runs 5 seconds warmup, 8 seconds at total concurrency 32, and 12 seconds
at 8,000 offered RPS. The demand lane caps each driver at 256 in-flight requests. Foreground PC
usage can vary. No React renderer or transport was changed; this is an eXact-only policy experiment.

| API    | Population | Policy    | Stage               | Valid RPS | Driver p95 ms | Driver p99 ms   | Missed arrivals | Errors |
| ------ | ---------: | --------- | ------------------- | --------: | ------------- | --------------- | --------------: | -----: |
| string |          1 | immediate | total-c32           |     8,409 | 5.12 / 5.13   | 5.83 / 5.89     |               0 |      0 |
| string |          1 | immediate | total-arrivals-8000 |     7,618 | 69.69 / 69.69 | 71.36 / 71.36   |           4,088 |      0 |
| string |          1 | batch     | total-c32           |    11,528 | 4.85 / 4.82   | 6.38 / 6.32     |               0 |      0 |
| string |          1 | batch     | total-arrivals-8000 |     7,993 | 11.78 / 11.94 | 14.97 / 15.13   |              56 |      0 |
| string |          1 | single    | total-c32           |     8,416 | 6.12 / 5.26   | 9.49 / 6.28     |               0 |      0 |
| string |          1 | single    | total-arrivals-8000 |     7,454 | 72.25 / 72.32 | 74.69 / 74.94   |           6,001 |      0 |
| string |          2 | single    | total-c32           |     8,203 | 5.55 / 5.71   | 7.26 / 8.04     |               0 |      0 |
| string |          2 | single    | total-arrivals-8000 |     7,459 | 74.30 / 73.98 | 77.12 / 76.67   |           6,016 |      0 |
| string |          2 | batch     | total-c32           |    12,473 | 4.44 / 4.42   | 5.55 / 5.51     |               0 |      0 |
| string |          2 | batch     | total-arrivals-8000 |     7,997 | 11.32 / 11.34 | 13.70 / 14.32   |               3 |      0 |
| string |          2 | immediate | total-c32           |     8,620 | 4.80 / 4.85   | 5.36 / 5.70     |               0 |      0 |
| string |          2 | immediate | total-arrivals-8000 |     7,571 | 69.95 / 69.95 | 72.00 / 71.87   |           4,629 |      0 |
| stream |          1 | immediate | total-c32           |     6,045 | 6.78 / 6.74   | 7.71 / 7.75     |               0 |      0 |
| stream |          1 | immediate | total-arrivals-8000 |     6,054 | 86.85 / 86.85 | 88.83 / 88.51   |          22,862 |      0 |
| stream |          1 | batch     | total-c32           |    10,490 | 5.41 / 5.43   | 6.86 / 6.72     |               0 |      0 |
| stream |          1 | batch     | total-arrivals-8000 |     7,996 | 13.81 / 13.73 | 18.13 / 18.32   |               2 |      0 |
| stream |          1 | single    | total-c32           |     5,960 | 7.04 / 6.96   | 9.16 / 8.40     |               0 |      0 |
| stream |          1 | single    | total-arrivals-8000 |     5,713 | 95.30 / 95.30 | 101.31 / 101.38 |          26,903 |      0 |
| stream |          2 | single    | total-c32           |     6,325 | 6.82 / 6.61   | 8.91 / 7.91     |               0 |      0 |
| stream |          2 | single    | total-arrivals-8000 |     5,988 | 88.32 / 88.25 | 90.56 / 90.37   |          23,643 |      0 |
| stream |          2 | batch     | total-c32           |    10,405 | 5.47 / 5.56   | 6.90 / 7.79     |               0 |      0 |
| stream |          2 | batch     | total-arrivals-8000 |     7,993 | 13.58 / 13.76 | 17.77 / 17.47   |               4 |      0 |
| stream |          2 | immediate | total-c32           |     6,074 | 6.70 / 6.69   | 7.59 / 7.52     |               0 |      0 |
| stream |          2 | immediate | total-arrivals-8000 |     6,052 | 87.42 / 87.36 | 107.14 / 107.97 |          22,885 |      0 |

RPS uses completed valid responses over the union of simultaneous driver stage spans. Percentiles
are per-driver values, not averages or pooled percentiles. All measured responses passed identity
validation; all stages completed without request errors. No response bodies are cached or shared.

## Interpretation

Batching 32 starts improves both string and stream throughput in both orders. Single-start scheduling
does not reproduce that gain. Demand tails improve substantially with batching. At concurrency 32,
string p99 changes direction between orders and is slightly worse in the first batch population.
These results justify an adaptive admission experiment; they do not justify always-on scheduling
for every workload. The current small document does not establish behavior for large documents,
sparse traffic, slow consumers, cancellation, or mixed workloads.

A Bun controller must distinguish creation of a Response from completion of response transmission.
The current Node controller observes ServerResponse finish events. Native Bun uses Fetch responses,
so reusing handler-resolution counts would silently change the controller signal. Establish and
validate an appropriate native completion signal before integrating the policy.

## Interpreting capacity misses

The public chart counts capacity misses when the driver cannot start an offered request because
its in-flight cap is reached. They are not completed responses exceeding a latency budget. Driver
scheduling misses and end-of-stage misses are separate raw counters. p95/p99 measure admitted
responses; missed arrivals must be considered alongside them.

Comparing the previous and current full captures is descriptive, not a controlled regression test:

| eXact lane, 10,000 offered RPS | Previous capacity misses | Current capacity misses |
| ------------------------------ | -----------------------: | ----------------------: |
| Node string                    |                    6.22% |                   6.93% |
| Node stream                    |                   12.50% |                  12.67% |
| Bun string                     |                   23.09% |                  23.68% |
| Bun stream                     |                   39.68% |                  39.97% |

The current full capture has 2,389 transport errors across both frameworks versus 2,684 previously.
All 2,359 current Node streaming connection refusals occur in the first second of the 8,000-RPS
demand stage while drivers reach their 256-request caps. This is consistent with connection-ramp
pressure, but the captures do not prove an OS backlog cause. The 30 Node string resets occur later.
No invalid HTML responses were recorded. Transport failures remain published.

## Evidence

[Raw evidence and runners](bun-admission-recheck-2026-09-11-evidence.zip) preserve every policy
population, request/tail counters, telemetry, worker source, and the measured eXact bundle.

Archive SHA-256: `0c559c83437e3132e93c7b15198cfc54fca2370ed0cae2804c2a0485d3a04a29`.
