# Scheduled-arrival error investigation — September 7, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The post-restart capture recorded 124 eXact request failures in the first second of the
second population's 8,000 requests/second stage: 74 in one driver and 50 in the other.
The 10,000 requests/second stage had no errors. The original driver discarded the
individual error codes, so the historical cause cannot be recovered from that capture.

These failures came from the driver's response-receive error path, rather than HTTP
status/body validation. Timeout and invalid-response counters were zero. This narrows
the possibilities to transport/receive failures or the driver's body-limit classification;
it does not establish an ECONNRESET, an application exception, or a server crash.
The worker remained alive. Windows System and Application event queries for the two
minutes before and after the failing stage returned no matching events. Nearby worker
telemetry did not show a large event-loop pause: the first sample after stage start had
a 27.4 ms maximum, with approximately 12 ms additional cumulative GC time since the
preceding sample. Neither observation identifies the failure.

## Diagnostic experiments

Each sequence used eXact and React, two independent load drivers, and two reversed
framework process populations. Arrival stages lasted 20 seconds at 8,000 and 10,000
scheduled requests/second, with a 256-request in-flight cap per driver. Warmup lasted
10 seconds. Counts below include warmup completions.

| Sequence             | Change                                         | Completed requests | Errors |
| -------------------- | ---------------------------------------------- | -----------------: | -----: |
| Original order       | 8k then 10k; warmup concurrency 8 per driver   |          1,786,669 |      0 |
| Reversed rates       | 10k then 8k; same warmup                       |          1,713,018 |      0 |
| Warm connection pool | 8k then 10k; warmup concurrency 256 per driver |          1,337,795 |      0 |
| Total                | 12 fresh framework blocks                      |          4,837,482 |      0 |

An initial connection ramp or transient transport failure is plausible given the timing,
but these runs did not reproduce it and do not prove that explanation. In particular,
the data does not establish an 8k-specific defect or show that 10k is inherently safer.
Diagnostic instrumentation was added incrementally between runs; these are failure
investigations, not controlled before/after performance comparisons.

At the user's request, the public scheduled-arrival charts now use the first rerun
(`2026-09-07T17:59:46.006Z`), which preserves the original rate order and warmup settings.
Both frameworks and both process populations are included. The normal-loading and
concurrency-sweep charts initially retained their original captures. The latter was subsequently
updated by the [concurrency refresh](concurrency-refresh-2026-09-07.md). For the arrival-only
publication, the publisher validated matching
target artifacts, host/runtime metadata, response identities, and request accounting across
these captures. The original 124 failures remain in the historical capture and this report.
The reversed-rate and warm-pool experiments are not used for publication.

## Observability fixes

The load driver now retains error codes and bounded samples at stage and interval
boundaries, including timestamps, phase, status, socket reuse, available local/remote
ports, and request duration. It distinguishes timeouts, body limits, HTTP status errors,
length mismatches, and hash mismatches. Each journal retains 32 samples and at most
32 distinct codes plus an overflow bucket; omitted sample counts remain explicit.
Response bodies are not copied into failure samples.

The worker records handler, response-producer, and accepted-socket failures in telemetry
and sampled stderr. The coordinator preserves stderr even when the worker exits cleanly.
Failures before a connection reaches the worker may have evidence only in the driver.

The Node adapter also had real production gaps: response-production errors could be
converted into a generic failure or disconnected response without logging their original
cause, and the endpoint handler did not observe rejection of its response-writing promise.
Those paths now report through the configured server logger, or console when none is
configured. A throwing logger falls back to console. Distinct body-cancellation failures
are reported without masking the original error. Intentional cancellation carrying the
request's exact abort reason is excluded from server-failure reporting. This is not a
process-wide uncaught-exception handler; low-level body-writer callers still own rejections.

## Validation and evidence

- 77 framework-comparison tests passed, including socket-reset fault injection and bounded
  error-storm accounting.
- 17 Node adapter tests passed, including failures before and after response commitment,
  a failing logger, rejected response writes, and subsequent healthy requests on a real server.
- All 35 shared browser/SSR correctness checks passed.
- Targeted lint, Node adapter build and package-content checks, platform-boundary checks,
  and documentation type checking and production build passed. Desktop/mobile rendering
  checks matched the existing chart data and verified the public logging documentation.
- A deliberately failing SSR producer returned a generic HTTP 500 while its original
  exception and stack appeared in worker telemetry and stderr. This proves the new logging
  path, not the cause of the historical failures.

The companion JSON manifest (local capture: `arrival-errors-2026-09-07.json`) links the three raw diagnostic captures, event-query results,
fault-injection proof, and source hashes. See [SSR load testing](../ssr-load-testing.md)
for the maintained diagnostic contract.
