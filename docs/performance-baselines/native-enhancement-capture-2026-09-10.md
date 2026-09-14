# Native sink enhancement capture

Date: 2026-09-10. Experimental runtime integration; production compiler selection remains unchanged.

The native sink prototype previously rejected rendering when enhancement routes were active.
Enhancements may rearrange their target HTML, so publishing the target directly to the outer sink
before the enhancement finishes is incorrect. The candidate temporarily clears the shared writer
sink within an enhanced operation. The same native renderer then collects scoped strings using
its existing local sink. Cleanup restores the caller sink on success, rejection, or cancellation.
Nested captures retain the outer scope. This does not introduce another rendering engine.

The capture change is installed by both native prototype builders. The retained comparison-app
artifact is byte-identical to the measured candidate. It is still a runtime prototype transformation,
not a production ABI migration. The compiler emits the native writers used by the fixtures.

## Measurements

Hypothesis before measurement: ordinary rendering should change by less than roughly 1%.
Fresh production-mode Node 26.8.1 and Bun 1.4.2 processes perform 5,000 warmups and 12,000
measured renders per sample. Each cell averages two reversed-order samples. All four assets,
the application-owned document shell, and hydration/bootstrap output are included. Streams are
fully consumed through Response.text(). These are renderer microseconds, not HTTP requests/s.
No builds or tests ran concurrently with the timed processes. Output hashes match.

| Runtime | Document | Mode | Before | Capture | Change |
| --- | --- | --- | ---: | ---: | ---: |
| node | assets | string | 36.04 | 36.37 | +0.9% |
| node | assets | stream | 57.31 | 57.44 | +0.2% |
| node | large | string | 161.49 | 160.77 | -0.4% |
| node | large | stream | 201.33 | 193.48 | -3.9% |
| bun | assets | string | 38.78 | 36.02 | -7.1% |
| bun | assets | stream | 51.82 | 51.30 | -1.0% |
| bun | large | string | 210.71 | 205.59 | -2.4% |
| bun | large | stream | 261.24 | 269.03 | +3.0% |

The first large Bun stream samples changed direction: 259.87 to 276.70 microseconds,
then 262.62 to 261.35. Small Bun string samples also varied substantially. This prompted a
separate repeat of the large-document pairs, without changing the artifacts:

| Runtime | Document | Mode | Before | Capture | Change |
| --- | --- | --- | ---: | ---: | ---: |
| node | large | string | 160.39 | 157.22 | -2.0% |
| node | large | stream | 195.06 | 193.11 | -1.0% |
| bun | large | string | 209.19 | 211.66 | +1.2% |
| bun | large | stream | 264.94 | 264.12 | -0.3% |

These samples do not establish the proposed 1% bound. Bun string direction changes between
runs, and the large initial streaming regression does not repeat. There is no consistent overall
performance improvement to claim. Capture is retained because it removes a concrete correctness
blocker for native sink integration without a repeatable large regression.

React was not rerun in this capture-overhead experiment. The last paired comparison remains
[the native lazy-frame comparison](native-lazy-frame-2026-09-09.md): Node large string
158.66 versus React 131.27 microseconds, and Bun 202.57 versus React 188.92. Those figures
belong to that earlier paired run and must not be combined with this run as a new React gap.

## Correctness evidence

On each runtime, 18 enhancement scenarios compare candidate and production results with and
without markers: direct intrinsic, transparent fragment, nested wrapping, routed root prefix,
target forwarding, nested target forwarding, pending server task, rejected task, and abort.
HTML and hydration records match. Setup/disposal counts balance, the caller sink is restored,
and host, enhancement-route, and target-receipt stacks are empty. Pending enhanced markup
remains unpublished until its target completes. Target forwarding preserves merged classes
and accessibility attributes.

An additional 40 byte-limit scenarios per runtime compare production and candidate at one byte,
one below the result size, exactly the result size, and one above it. Their 80 recorded results
per runtime match, and cleanup checks pass even when rendering rejects.

The existing native scheduled-document fixture was rebuilt with capture support. Both runtimes
still match production HTML and hydration with and without markers. Twelve pressure/cancellation
cases pass. Two real Chromium adoption cases retain element/text/script identity, avoid restarting
server tasks, and dispose owned components. These browser cases cover the existing scheduled
document, not client adoption of the newly added enhancement fixtures.

## Remaining integration work

Production still uses the prior writer ABI. The native sink contract must be migrated through
core, SSR runtime, compiler selection, callers, and tests before these experimental capabilities
can be described as production behavior. The full comparison-app stream still collects its
document; progressive head publication is validated by the scheduled-document fixture only.
String performance still trails React in the last paired results.

The [evidence archive](native-enhancement-capture-2026-09-10-evidence.zip) preserves all timed
samples, exact artifacts, compiler requests/responses, fixture sources, validation results,
prototype transformations, and a SHA-256 manifest. Public documentation is unchanged because
no published behavior or API changed.
