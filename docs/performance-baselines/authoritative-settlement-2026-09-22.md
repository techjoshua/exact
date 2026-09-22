# Authoritative settlement: browser scheduling investigation

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

[Diagnostic evidence](authoritative-settlement-2026-09-22-evidence.zip) contains the runnable private
probes, raw samples, captured-resource hashes, and four browser traces. Extract it at the repository
root to restore the `.tmp/settlement-phases-2026-09-22` paths used by the probes. Production builds and
the existing benchmark environment are prerequisites. Example invocation:

```sh
unshare --user --map-root-user --net --pid --fork --mount-proc --kill-child=SIGKILL \
  bash -c 'ip link set lo up && source .tmp/wsl-benchmark-env.sh && TRACE_NETWORK=0 exec node .tmp/settlement-phases-2026-09-22/run-deferral-paired.mjs'
```

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

All new raw captures have the expected sample counts and complete settlement/HTTP timing fields.
JavaScript and CSS hashes match across those captures, and the evidence archive passes its integrity
check. Documentation type checking, formatting, and the production build from `apps/docs` pass.
