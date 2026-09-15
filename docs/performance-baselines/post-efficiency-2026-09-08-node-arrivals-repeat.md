# Node arrival-rate follow-up, September 8, 2026

The [remaining SSR tests were repeated afterward](post-efficiency-2026-09-08-ssr-repeat.md).

A single repeat of the scheduled-demand comparison completed with zero request
errors in all eight measured stages and all four warmups. The earlier 13 eXact
connection resets and 155 React connection refusals did not recur. This does not
isolate their cause or establish that they cannot recur.

The run began at 16:00:34 UTC. It used the same runner, workload plan, Node 26.8.1,
two independent drivers, ten-second warmups, and twenty-second stages as the
[original capture](post-efficiency-2026-09-08.md). Both participant entry artifacts,
the server package, and the Node adapter matched the original recorded artifact
identities. No code or benchmark settings were changed for this repeat.

Population 1 ran eXact then React; population 2 ran React then eXact. Valid RPS
divides valid responses by the union of both drivers' stage wall-time intervals,
including drain. Misses are offered requests that the drivers did not start,
separate from failed requests. There were no scheduling-lag misses.

| Population | Framework | Offered RPS | Valid RPS | Request errors | Capacity misses | Deadline misses |
| ---------- | --------- | ----------: | --------: | -------------: | --------------: | --------------: |
| 1          | eXact     |       8,000 |     7,996 |              0 |               0 |              39 |
| 1          | eXact     |      10,000 |     9,804 |              0 |           3,484 |               4 |
| 1          | React     |       8,000 |     7,997 |              0 |               0 |               0 |
| 1          | React     |      10,000 |     9,900 |              0 |           1,946 |               1 |
| 2          | React     |       8,000 |     7,997 |              0 |               0 |               6 |
| 2          | React     |      10,000 |     9,992 |              0 |               0 |               5 |
| 2          | eXact     |       8,000 |     7,996 |              0 |               0 |               4 |
| 2          | eXact     |      10,000 |     9,767 |              0 |           4,083 |               5 |

All server stderr and telemetry-error collections were empty. The runner's request
accounting and artifact-stability assertions passed, its report is marked complete,
and its owned processes were closed. The pre-existing development processes were
left running. Background workstation activity was not measured.

This is a retained follow-up, not a replacement selected for having zero errors.
The original evidence and public benchmark capture remain intact. Higher throughput
than the earlier run cannot be attributed to a framework change because this repeat
did not change the measured artifacts.

[Raw follow-up capture](post-efficiency-2026-09-08-node-arrivals-repeat.json)
