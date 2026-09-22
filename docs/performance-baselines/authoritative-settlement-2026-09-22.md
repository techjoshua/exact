# Authoritative settlement: browser scheduling investigation

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

## Outcome

No framework optimization was accepted. The measured interval is dominated by Chromium's scheduling
of network delivery around the next frame after input. Reducing the application's pre-request work
or suppressing its optimistic handler did not improve eXact's stream receipt. Removing optimistic
feedback would violate the comparison contract.

The published full-suite means remain eXact 12.960 ms and React 12.217 ms. These measurements include
the service, transport, browser scheduling, and authoritative DOM update. They do not establish that
React applies the authoritative resource faster. In the focused default-policy control, eXact's
stream-receipt-to-DOM interval was 0.425 ms versus React's 1.165 ms.

Production sources and participant artifacts were unchanged from `e579e586` throughout these
experiments. The latest full performance capture measured implementation `dd3d7e69`. No browser
flags, input scheduling changes, or diagnostic results replace the published charts.

## Method and evidence

The private probes and traces are not retained. The method and observed results are recorded
below; rebuilding the framework alone does not recreate these diagnostic runners.

The probes use the common captured-page HTTP replay, a shared controlled service, verified native
Linux loopback, fresh cache-disabled contexts, and alternating participant/variant order. They use
Node 26.9.0 and Playwright's installed Chromium 149.0.7827.55. Unlike the admitted full-suite capture,
these diagnostics do not discard a scenario warmup, so their absolute means are not replacements
for full-suite numbers. Service instrumentation wraps existing behavior only in the private runner.
Server durations stay within the server clock; browser durations stay within the browser clock.

Each completed scenario asserts Version 2, owner Alex Chen, decoded HTTP completion, and no page
errors. The early-dispatch probe additionally verifies that the authored request reuses the identical
prestarted request body. These checks validate the diagnostic scenario, not every failure or lifecycle
contract. All owned browsers and servers close through the harness lifecycle.

## Shared service and browser delivery

The untraced service-instrumented run has 20 samples per framework. Mean milliseconds:

| Interval                              |  eXact |  React |
| ------------------------------------- | -----: | -----: |
| Preflight receipt to response finish  |  0.355 |  0.417 |
| Claim receipt to SSE write            |  0.473 |  0.500 |
| Claim receipt to HTTP response finish |  0.733 |  0.786 |
| Click to SSE receipt                  | 12.490 | 11.325 |
| Click to authoritative DOM mutation   | 12.925 | 12.565 |

The service does not account for the approximately one-millisecond difference in stream receipt.
Earlier network tracing also found similar preflight and POST wire intervals. Every claim in that
capture required CORS preflight. Browser traces show response delivery after the next frame even
when the response finished earlier in the network timeline.

Chromium's [scheduler integration tests](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/scheduler_integration_tests/scheduler_policy_test.cc)
explicitly exercise task deferral after input until a subsequent main frame. This mechanism motivated
the following control; the measurements, rather than the source reference alone, establish its
importance in this workload.

## Alternating browser-policy control

`run-deferral-paired.mjs` uses separate default and diagnostic browser processes, with 20 samples per
framework/policy combination, 80 total. The diagnostic browser adds
`--disable-features=DeferRendererTasksAfterInput`. Application handlers, optimism, service behavior,
and response validation remain intact. Mean milliseconds:

| Framework | Policy            | Optimistic DOM | SSE receipt | Authoritative DOM | SSE to DOM |
| --------- | ----------------- | -------------: | ----------: | ----------------: | ---------: |
| eXact     | Default           |          1.775 |      12.390 |            12.815 |      0.425 |
| eXact     | Deferral disabled |          1.920 |       5.855 |             6.230 |      0.375 |
| React     | Default           |          1.860 |      11.405 |            12.570 |      1.165 |
| React     | Deferral disabled |          1.960 |       5.220 |             5.960 |      0.740 |

An independent earlier disabled-policy run produced 5.510 ms for eXact and 6.345 ms for React.
The ordering is not stable enough to rank framework update speed using these end-to-end means.
The paired disabled-policy sample maxima were 14.6 ms for eXact and 12.8 ms for React. Lower means
therefore do not establish a tail improvement. Disabling a browser responsiveness policy is not a
shippable framework optimization or an admissible replacement benchmark configuration.

## Input position within the frame

`run-input-phase.mjs` retains default Chromium settings and unchanged application code. It compares
normal locator clicks with trusted mouse input requested after a rendering opportunity and delays
of 0, 4, 8, or 12 ms. It records the first animation-frame callback following the click. The delay is
requested, not an exact guaranteed input phase: browser/driver communication also takes time.
There are 10 samples per framework/variant, 100 total. Mean milliseconds:

| Input variant         | eXact next frame | eXact settlement | React next frame | React settlement |
| --------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| Normal locator click  |           11.450 |           12.460 |           11.000 |           13.230 |
| Requested delay 0 ms  |           13.690 |           14.780 |           13.310 |           15.370 |
| Requested delay 4 ms  |            9.830 |           11.000 |            9.020 |           11.710 |
| Requested delay 8 ms  |            6.390 |            7.940 |            4.890 |            7.560 |
| Requested delay 12 ms |            2.550 |            5.560 |            2.670 |            8.000 |

This control changes input timing for diagnosis. Its animation-frame observation also adds work,
so it must not replace ordinary samples. It shows that frame alignment can dominate settlement
and change the relative ordering while both applications remain unchanged. Excluding actionability
waits from the timer does not eliminate their possible effect on frame alignment.

## Candidate decisions and remaining opportunity

- Moving the identical request ahead of the authored handler while retaining optimism changed
  eXact settlement from 12.870 to 12.915 ms: no demonstrated gain.
- Suppressing the optimistic handler entirely left eXact SSE receipt essentially unchanged
  (12.030 versus 12.055 ms) and worsened settlement (12.435 versus 12.890 ms). This diagnostic
  also violates required optimistic behavior and cannot ship.
- The shared service finishes the claim path in less than one millisecond on average for both
  frameworks. It is not the source of the observed receipt difference.
- Browser-policy and input-phase controls explain a large scheduling floor. They are evidence
  about attribution, not changes to claim correctness or framework performance.

A useful framework optimization must reduce work inside the event handler or after authoritative
receipt and then improve ordinary-browser samples while preserving optimism, version fencing,
cancellation, and tails. The tested upper-bound prelude reductions did not improve settlement;
the remaining eXact receipt-to-DOM interval is already about 0.4 ms in these samples. No supported
framework mechanism was identified that safely removes the browser's frame-dependent wait.

Future investigations should compare handler and receipt-to-DOM work separately, retain normal
browser settings, and use balanced input-phase controls to distinguish a CPU improvement from
frame alignment. Actual painted-response latency is a separate endpoint. No full SSR rerun was
performed because no runtime, compiler, participant, or benchmark behavior was changed.

## Validation

At measurement time, all captures had the expected sample counts and complete settlement/HTTP
timing fields. JavaScript and CSS hashes matched across captures. Documentation type checking,
formatting, and the production build from `apps/docs` passed.

## Follow-up: why React reaches fetch sooner

The browser deferral finding does not explain the earlier request dispatch. A second investigation
measured the pre-request work itself. The private probes used in-memory replay transformations and CPU profiles.
No source or generated participant artifact was changed. Fixed minified replacement sites are
asserted, so these probes require the baseline participant builds rather than arbitrary later output.

The normal-speed instrumented run has 40 samples per framework. Approximate mean milliseconds:

| Work before fetch                      | eXact | React |
| -------------------------------------- | ----: | ----: |
| Captured click to authored handler     | 0.243 | 0.123 |
| Validation and selection/version fence | 0.060 | 0.003 |
| Incident snapshot copy                 | 0.045 | 0.013 |
| Optimistic projection construction     | 0.008 | 0.000 |
| Apply or queue optimistic state        | 0.330 | 0.033 |
| Clear errors and prepare request       | 0.050 | 0.060 |
| Total click to fetch                   | 0.735 | 0.230 |

These clocks add overhead and have limited resolution; they locate work rather than replacing
uninstrumented benchmark numbers. eXact reads through reactive properties, maintains its durable
selection fence, and mutates the existing incident inside a rollback-capable batch. React copies
plain data and queues a state update. Both dispatch before the optimistic DOM mutation is observed.

The first optimistic property write accounts for approximately 0.178 ms in this run. A more detailed
probe places about 0.083 ms before the proxy setter's first instrumented statement, with smaller
intervals for undo capture, Reflect.set, and hash invalidation. That entry interval alone does not
prove JavaScript compilation is responsible. An alternating `--js-flags=--no-lazy` control did not
materially change eXact dispatch (0.730 versus 0.715 ms). CPU profiles with 6x throttling also locate
work in the setter, merge callback, event entry, and indexed reads; sampling/mark overhead prevents
using their sample shares as ordinary-browser cost percentages.

### First use versus repeated mutation

A counter-only check finds 20 indexed state writes and zero proxy setter calls before the claim in
all three eXact samples. After authoritative completion, those counts are 23 and 6. eXact's startup
connection changes use indexed state writes, while the incident merge exercises the nested-object
proxy setter for the first time. React's ordinary state-update queue has already been exercised by
its live-connection status changes before the claim.

A separate 40-sample-per-case control performs batched writes on detached throwaway reactive objects
before clicking. It leaves the application's incident state untouched. Mean milliseconds:

| Prior detached mutations | First optimistic write | Click to fetch | Optimistic DOM |
| ------------------------ | ---------------------: | -------------: | -------------: |
| None                     |                  0.163 |          0.705 |          1.860 |
| One                      |                  0.028 |          0.545 |          1.713 |
| 100                      |                  0.015 |          0.535 |          1.730 |

React's dispatch mean in this control is 0.233 ms. Priming this shared mutation path removes about
0.16 ms, roughly one third of the observed dispatch gap, without changing event-entry time materially.
It establishes a first-use cost but does not isolate engine inline caches, compilation, or another
individual mechanism. Executing dummy mutations during startup would move work across measurement
boundaries and is not an accepted optimization.

### Attempted implementation improvements

Uninstrumented replay candidates isolate ordinary-object undo capture from array rollback logic,
isolate ordinary-object writes from array-specific setter work, or combine both. Each retains
reflective writes, descriptor restoration, rollback, and the original array behavior. The first run
has 40 samples per framework/candidate, and the repeat adds the combined candidate with the same
sample count. Dispatch mean milliseconds:

| Candidate          |    First run | Repeat |
| ------------------ | -----------: | -----: |
| Original eXact     |        0.725 |  0.643 |
| Object undo path   |        0.635 |  0.773 |
| Object setter path |        0.633 |  0.663 |
| Combined paths     | Not measured |  0.615 |
| React control      |        0.223 |  0.195 |

The initial approximately 12% gains did not reproduce for either standalone change. Most eXact
medians remain 0.6 ms; the repeat undo candidate has a 0.7 ms median. A final repeat uses 60 samples each for original eXact, the combined candidate, and React, with
rotating participant order. Original and combined eXact both average 0.648 ms to dispatch with a
0.6 ms median. Optimistic feedback averages 1.798 versus 1.758 ms, while settlement averages
12.972 versus 13.070 ms. The initial combined dispatch advantage therefore does not reproduce. No candidate is accepted, and these limited success-path assertions are not a substitute for
rollback, accessor, array, lifecycle, and concurrent-authority regression coverage before shipment.

This narrows the remaining opportunity to first-use nested mutation cost plus event-entry and
reactive-access overhead. It does not establish that all of that cost is unavoidable, but the tested
simplifications do not yet provide a repeatable improvement. There is no framework change to send
through full performance publication. All 1,046 diagnostic samples have complete settlement and HTTP
completion fields in the original measurement validation.

## Follow-up: frame-aligned requests

A frame-alignment experiment crosses request ordering
with ordinary locator clicks, trusted mouse input sent after a `requestAnimationFrame` callback,
and `HTMLElement.click()` executed directly inside that callback. The first run has 30 samples per
framework/alignment/ordering, 360 total. A repeat measures the two aligned modes with 40 samples per
case, 320 total. Both runs use fresh contexts, rotating case order, normal Chromium settings,
unchanged participant artifacts, and the shared service. All 680 samples complete the owner/version,
optimistic feedback, HTTP JSON, page-error, request-reuse, and trusted/synthetic-event checks.

Request-first is the same upper-bound capture-listener probe used earlier. It precedes authored
validation and rollback-snapshot capture, then makes the unchanged application reuse the identical
request. It preserves optimistic work for this successful scenario but does not validate a production
request-first failure or cancellation contract.

Mean authoritative settlement in the repeat, milliseconds:

| Framework | Input method               | Current ordering | Request first |
| --------- | -------------------------- | ---------------: | ------------: |
| eXact     | Trusted input after rAF    |           15.633 |        15.610 |
| React     | Trusted input after rAF    |           15.085 |        15.400 |
| eXact     | Synthetic click inside rAF |            6.935 |         5.228 |
| React     | Synthetic click inside rAF |           10.037 |         7.457 |

For trusted eXact input, request dispatch moves from 0.730 to 0.055 ms and optimistic feedback from
1.963 to 1.532 ms, but settlement is effectively unchanged. The measured rAF-callback-to-click offsets
are closely matched at 2.228 and 2.290 ms. The driver round trip prevents exact within-callback trusted
input alignment. React's corresponding offsets are 3.530 and 3.313 ms, so rAF synchronization does
not establish identical frame positions across participants.

For synthetic eXact input, settlement medians are 6.2 versus 5.0 ms and maxima 14.5 versus 10.0 ms.
The first run also showed a benefit in this mode, 6.593 versus 5.400 ms. React's synthetic repeat
medians are 10.3 versus 6.45 ms, with maxima 25.7 versus 12.4 ms. These small captures do not establish
stable production tails. Direct rAF clicks were verified to have `event.isTrusted === false`, while
driver clicks were trusted. Synthetic execution inside a rendering callback changes the input and
scheduling workload, so its faster results must not replace the ordinary-input charts.

The first run's ordinary eXact click control remained essentially unchanged at 12.987 versus
13.020 ms. Its trusted-rAF case initially suggested a 0.400 ms request-first benefit, which did not
repeat once measured click offsets closely matched. Initial frame-offset observations ran after
the early fetch call and included its synchronous overhead; the repeat instead uses the original
captured click timestamp relative to the rAF callback. Primary interaction endpoints are unchanged.

Frame alignment is useful for distinguishing work ordering from browser input scheduling. It does
not remove the frame-dependent wait for real input. These diagnostic results demonstrate a
request-first benefit in the synthetic rAF workload, not a validated production optimization.
No framework, participant, public benchmark protocol, or published chart values were changed.

## Follow-up: repeated optimistic interactions on one page

The existing published interaction charts measure the first claim on a fresh page, even though the
browser process has been warmed. They do not represent later claims on that page. Earlier references
to lazily loaded optimistic code were too strong: the evidence establishes first-use execution cost,
not loading of a separate JavaScript bundle. The eager-compilation control also did not establish
compilation as the specific cause.

A same-page diagnostic measures six real claims per
page, with 20 fresh contexts per framework in each of two runs. Each run has 240 claims: 20 first
and 100 later claims per framework. Later observations within one page are correlated.

The first claim targets inc-100, and the second targets the previously unassigned inc-102. Before
claims three through six, the service fixture is restored using its existing reset endpoint, the
queue is refreshed through the UI, and selection alternates between those incidents. Each timed
claim therefore changes Unassigned/open/Version 1 to Alex Chen/investigating/Version 2. Reclaiming an
already-owned incident would not exercise equivalent optimistic work. Setup and navigation are
outside the timing interval, the page's time origin remains unchanged, and all clicks are trusted.
React remounts its incident-keyed detail on selection while eXact retains its durable detail instance;
this is a repeated page-interaction workload, not identical component-instance lifecycles.

Mean milliseconds in the independent repeat:

| Framework | Claim stage               | Dispatch | Optimistic DOM | Authoritative DOM |
| --------- | ------------------------- | -------: | -------------: | ----------------: |
| eXact     | First                     |    0.710 |          1.925 |            12.680 |
| eXact     | Later, claims 2 through 6 |    0.260 |          0.787 |            13.661 |
| React     | First                     |    0.210 |          1.725 |            10.220 |
| React     | Later, claims 2 through 6 |    0.071 |          0.795 |            13.886 |

The initial run independently showed the same local-work improvement: eXact dispatch fell from
0.640 to 0.247 ms and optimistic feedback from 1.645 to 0.776 ms. React dispatch fell from 0.210 to
0.083 ms and optimistic feedback from 1.765 to 0.804 ms. Both frameworks benefit from repeating real
interactions, and their warmed optimistic feedback is essentially tied in these captures. A real
prior interaction warms more paths than the earlier detached-object mutation control.

All 480 measured claims still performed a CORS preflight. Eliminating preflight requests therefore
does not explain this improvement, though other transport state can still change. Each sample checks
successful HTTP status and authoritative payload, expected pre-claim and post-claim DOM fields,
optimistic timing, decoded HTTP completion, exactly one POST, unchanged page time origin, and no page
errors. All checks passed. No page reload or fake optimistic no-op is used to manufacture warm scores.

Faster local work does not imply lower end-to-end settlement here. Later trusted clicks still wait
for browser/network delivery, and their navigation/refresh preparation differs from the first claim's
setup. These diagnostic first-claim numbers also must not replace the admitted full-suite capture.
First-claim and repeated-interaction distributions should be reported as distinct workloads; this
investigation does not silently discard the first-claim cost or publish warm results as a framework
optimization. Public documentation now explicitly identifies the existing charts as first-claim
measurements. Participant code, framework code, and published chart values are unchanged.
