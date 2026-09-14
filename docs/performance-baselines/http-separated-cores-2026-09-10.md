# Separate physical cores for HTTP worker and drivers

Status: the renderer invocation gap remains when task-owned load drivers cannot
run on the server's physical core. No production code or user process setting changed.

## Hypothesis and control

Local load drivers may compete with the renderer for core resources, including
on sibling logical processors. If that explains most of the HTTP-versus-loop
increase, separating them should move invocation cost substantially toward the
roughly 23-microsecond isolated result. This is an experimental control, not a
framework optimization or a replacement benchmark baseline.

Measured topology from the placement report identifies eight physical core pairs.
The owner assigns only its child processes and verifies each resulting process
affinity mask:

| Role | Logical processors | Mask |
| --- | --- | ---: |
| HTTP server worker | 4, 5 | 48 |
| First load driver | 8, 9 | 768 |
| Second load driver | 10, 11 | 3072 |
| Controlled data service | 12, 13 | 12288 |

Affinity applies to whole processes, including their helper threads. Server helper
threads therefore share one physical core too, which is a material limitation of
this control. No core is reserved against user processes, interrupts or OS work.
The coordinator remains unrestricted. Masks disappear when the owned processes
exit; no system-wide affinity or power policy changes occur.

The worker and measurement protocol otherwise derive from the placement capture:
production Node 26.8.1, four fresh workers in eXact/React/React/eXact order, ten-second
HTTP warmup, before/after isolated captures with 10,000 warmup and 10,000 measured
renders each, and five seconds of HTTP concurrency 32 through two fresh drivers.
All owned processes run below normal priority. No builds/tests/profilers overlap
timing, and user PC workload may vary.

## Results

Wall times are mean microseconds of synchronous renderer invocation. Cycles are
mean thousands of scheduled thread cycles; do not convert them into elapsed time.

| Worker | Wall before / HTTP / after | Cycles before / HTTP / after | Diagnostic HTTP RPS |
| --- | ---: | ---: | ---: |
| eXact 1 | 23.27 / 45.11 / 24.40 | 89.26 / 171.06 / 93.59 | 9,110 |
| React 1 | 22.41 / 32.77 / 22.37 | 85.64 / 125.61 / 85.99 | 12,506 |
| React 2 | 22.42 / 30.85 / 22.08 | 85.72 / 118.24 / 84.82 | 12,969 |
| eXact 2 | 22.93 / 44.55 / 23.45 | 87.81 / 168.94 / 89.86 | 9,257 |

All recorded starting processors are 4 or 5, as assigned. Each isolated result
matches its worker's complete HTTP document size: eXact 4,672 bytes, React 3,660.
The four measured HTTP windows contain 219,357 valid responses and zero errors,
excluding warmups and preflights. Placement counters include two driver preflights
per window. Artifact hashes and server/adapter inventories remain unchanged.
All owned processes close; only the user's existing Codex Node remains.

These results do not establish a precise affinity benefit compared with the
preceding unpinned capture, which used different processes and wall-clock periods.
They do show that a roughly 12 to 14 microsecond inter-framework invocation gap
persists when our drivers cannot occupy the worker's physical core. Contention
with those drivers on that core is therefore insufficient as the sole explanation.
Broader resource pressure, helper-thread contention, frequency behavior and locality
remain possible. Neither framework reaches its isolated renderer cost under HTTP.

## Next distinction

Compare execution counts within the render interval for matched isolated and HTTP
requests. That can identify additional framework work or branch paths before
attempting another sink rewrite. Equal counts would not prove equal instruction
cost or eliminate native/GC work; it would narrow investigation toward the cost
of the same observed operations in the two execution contexts.

The archive preserves affinity helper, verified masks, worker, runner, native probe,
raw capture, summary, participant artifacts and SHA-256 manifest. The existing
structural-stack prototype remains unaccepted. No browser/package acceptance or
framework performance improvement is claimed.
