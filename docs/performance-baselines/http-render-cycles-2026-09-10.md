# Thread cycles inside renderer invocation

Status: synchronous renderer invocation consumes substantially more scheduled
thread cycles during HTTP load than in isolated loops. Waiting off-CPU alone does
not explain the observed increase. No production code changed.

## Probe selection and calibration

Node 26.8.1 exposes process.threadCpuUsage, but local calibration found 199,997
zero deltas in 200,000 consecutive samples. Positive steps were 15,000 or 16,000
microseconds. A one-millisecond busy loop returned zero CPU time and a five-
millisecond loop returned 16 milliseconds. That clock cannot resolve individual
renderer calls and was not used to attribute their CPU time.

A scratch Node-API addon calls QueryThreadCycleTime for the current thread. It
uses installed MSVC and kernel32, resolves Node's exported ABI at load time, and
has no framework dependency or installation step. Windows documents that this
counter includes user and kernel cycles and must not be converted to elapsed
time: [QueryThreadCycleTime reference](https://learn.microsoft.com/en-us/windows/win32/api/realtimeapiset/nf-realtimeapiset-querythreadcycletime).

Calibration after 10,000 warmup reads produced no zero or negative deltas in
200,000 reads, with a minimum positive delta of 758 cycles. The full sampling
loop averaged 0.288 microseconds per iteration, including JS bookkeeping, so it
is an overhead estimate rather than the isolated native-call cost. A 100 ms busy
loop accumulated 379 million cycles, while a 108 ms timer wait accumulated only
0.565 million. This supports distinguishing scheduled execution from idle waiting.
It does not calibrate cycles into time or instructions.

## Method

The worker extends the original invocation trace with a cycle read immediately
before the wall timer and another immediately after the synchronous callback
returns. Cycle intervals include those wall-clock reads and probe boundary cost.
They exclude awaiting the returned value. Both isolated loops and HTTP calls use
the same probe. No fixed overhead is subtracted or converted into microseconds.

Four fresh production Node 26.8.1 workers run eXact, React, React, eXact. Each warms
under HTTP for ten seconds, records an isolated loop, measures five seconds of
HTTP concurrency 32, and records another isolated loop. Each loop first warms
10,000 iterations and records another 10,000. Two fresh drivers run concurrency
16 each. All processes run below normal priority, without concurrent builds,
tests, or sampling profilers. User PC workload may vary.

## Results

Cycle values are mean thousands of cycles per invocation, not retired instructions.
Wall values are separately measured mean microseconds.

| Worker  | Cycles before / HTTP / after | Wall before / HTTP / after | Instrumented HTTP RPS |
| ------- | ---------------------------: | -------------------------: | --------------------: |
| eXact 1 |       91.20 / 214.89 / 92.84 |      23.73 / 56.12 / 24.16 |                 7,924 |
| React 1 |       90.09 / 154.17 / 90.30 |      23.41 / 40.18 / 23.48 |                10,091 |
| React 2 |       88.43 / 156.61 / 86.85 |      22.98 / 40.85 / 22.55 |                10,253 |
| eXact 2 |      89.99 / 213.52 / 102.40 |      23.40 / 55.74 / 26.63 |                 7,962 |

The four HTTP windows contain 181,324 valid responses, zero errors, excluding
warmups and preflights. Cycle counters include the two driver preflights per
window, hence their counts exceed measured valid requests by two. Isolated
capture counts are 10,000 each. Complete documents remain 4,672 bytes for eXact
and 3,660 for React; isolated byte counts match each worker's HTTP identity.
Artifact hashes and server/adapter build inventories remain unchanged. All owned
processes close; only the user's Codex Node remains.

HTTP eXact invocation uses approximately 2.35 to 2.37 times its before-loop cycles,
while React uses approximately 1.71 to 1.77 times. This demonstrates that most of
the observed pattern cannot be explained as wall-clock time while the thread is
simply not scheduled. It does not prove additional instructions are executed.
Processor placement, frequency behavior, cache/memory stalls, GC within the call,
and execution-path differences remain possible. The Windows counter's platform-
dependent semantics preclude deriving a precise off-CPU duration from these values.

## Next distinction

Record processor placement alongside the invocation samples before blaming the
compiler or making another sink change. Tight loops and network-driven callbacks
may run on different logical processors or migrate differently. If placement
does not explain the difference, compare executed work and memory behavior under
these two contexts using the same artifacts. Preserve the shared render engine
and full output contract throughout.

The evidence archive includes both clock calibrations, addon source and binary,
worker, runner, raw captures, summary, CPU description, participant artifacts, and
a verified SHA-256 manifest. This native probe is scratch diagnostic code, not a
published dependency or framework API. No production improvement or package/browser
acceptance is claimed.
