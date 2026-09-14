# Skipping fresh output consumption after rendering

Status: removing the tested post-render string reads does not improve eXact's
HTTP rendering cost. No production code changed.

## Hypothesis and scope

The preceding pre-encoded-output diagnostic retained byte counting and a prefix
check on every fresh string. These reads could preserve the pressure being tested.
This extension substitutes the captured fixture byte count for those post-render
Buffer.byteLength calls and removes the end wrapper's startsWith check. Rendering,
hydration publication, response-wrapper construction and the adapter still execute.
Cached mode sends the previously encoded fixture document.

If consuming the fresh final string were a major cause of subsequent renderer
slowdown, eliminating those reads should reduce invocation time toward the faster
second-render result, roughly a ten-microsecond reduction relative to prior single
invocations. This is a diagnostic hypothesis, not an adoption threshold.

Fresh mode retains actual byte counts and sends the newly rendered document.
Cached mode requires an already captured document and verifies equality against
a newly rendered string at the first request after each mode switch. Measurement
drivers preflight before starting their stages. Every transmitted response is
identity-validated, but discarded fresh renderings are not compared on every
measured request. Framework-internal string consumption remains possible; this
test does not remove reads inside document construction or hydration publication.

The existing four-worker order, ten-second warmup, alternating three-second blocks,
two drivers at concurrency 16, production Node 26.8.1, and below-normal priority
remain as described in `http-preencoded-output-2026-09-10.md`. There is no concurrent
build, test, or profiler. User workload may vary. This is deliberately cached-output
diagnosis, not framework benchmark performance or an optimization to ship.

## Results

RPS gives equal weight to two blocks per mode in each worker. Invocation and end
times are request-weighted means in microseconds.

| Worker  | Fresh RPS | Cached RPS | Change | Invocation fresh/cached | response.end fresh/cached |
| ------- | --------: | ---------: | -----: | ----------------------: | ------------------------: |
| eXact 1 |    10,182 |      9,742 | -4.33% |           43.90 / 45.65 |             23.33 / 25.41 |
| React 1 |    12,765 |     13,945 | +9.24% |           32.35 / 31.39 |             18.46 / 17.24 |
| React 2 |    12,740 |     13,410 | +5.26% |           32.23 / 32.81 |             18.88 / 18.11 |
| eXact 2 |     9,655 |      9,312 | -3.55% |           45.41 / 46.20 |             24.16 / 26.38 |

The 16 blocks complete 551,355 valid responses with zero errors, excluding warmups
and preflights. Complete document sizes remain 4,672 bytes for eXact and 3,660 for
React. The runner verifies canonical artifact hashes and server/adapter inventories.
All owned processes close; only the user's existing Codex Node remains.

eXact does not gain from this treatment in either worker. React gains throughput
in both, but its invocation time moves only slightly and in opposite directions.
Different Node string/Buffer output paths remain part of the treatment. Do not
infer that byte counting has no cost, that allocation is ruled out, or that these
results establish a universal advantage of one representation.

## Direction

Together with the previous trace, this weakens fresh final-output consumption as
the explanation for eXact's much larger invocation time under HTTP. Continue with
execution context and benchmark instrumentation before further sink changes.

Source inspection finds that withTaskObserver uses a synchronous stack and finally
cleanup, not AsyncLocalStorage. The benchmark string path calls renderParticipant
directly and then the response adapter; it does not invoke runWithExactRequestScope.
Do not blame request-scope machinery that this workload never calls.

The worker does add per-request CPU snapshots, response method wrappers, finish
listeners, and a promise that awaits response completion. A focused control can
retain render timing while bypassing those outer telemetry wrappers in both
frameworks, checking whether the instrumentation itself disproportionately affects
eXact. That would diagnose benchmark overhead, not justify removing framework
lifecycle guarantees.

The adjacent archive preserves worker, runner, log, raw capture, summary, measured
participant artifacts and verified SHA-256 manifest. No production improvement or
package/browser acceptance is claimed.
