# Consecutive encoding of the same hydration payload

Status: diagnostic completed. No production change.

## Question and method

The payload-shape audit found equal JSON values and array representations in loop
and HTTP samples. This follow-up asks whether the first JSON.stringify call makes
the same freshly prepared graph substantially cheaper to encode again.

On every 64th synchronous render invocation, the existing split-region diagnostic
encodes the same payload twice, times each call separately, checks exact output
equality and returns the first output for normal script escaping. Unsampled
invocations encode once. No hydration result is reused between requests.

Two fresh production Node 26.8.1 workers use ten seconds of HTTP warmup, then a
10,000-warmup/10,000-measured loop, five seconds of HTTP, and another warmed loop.
The drivers each use concurrency 16. Processes run below normal priority, with
the same retained preloaded fixture and full application-owned document. The user
may be using the workstation. Instrumentation and duplicate work perturb execution.

## Results

Mean microseconds per sampled document across both workers:

| Native encoding       | Loop before | HTTP | Loop after |
| --------------------- | ----------: | ---: | ---------: |
| First call            |        1.53 | 5.26 |       1.30 |
| Immediate second call |        1.08 | 3.30 |       0.96 |

The immediate second call is cheaper, but remains substantially slower under HTTP.
Thus a first-encoding penalty exists in this diagnostic, but does not account for
the entire loop-to-HTTP increase. This does not distinguish string flattening,
memory/cache locality, call-site optimization or other runtime effects. The two
timed calls have separate diagnostic wrappers. These are instrumented wall times,
not unbiased native CPU costs or a demonstrated amount an optimization can save.

The experiment does not propose encoding twice in production. That adds work and
does not avoid the first call's cost. It also does not justify removing validation,
script escaping, or supported serialization semantics.

All 80,673 measured HTTP responses are valid with zero errors. Instrumented HTTP
rates are 7,997.41 and 8,117.44 RPS; they are not replacement baseline rates or a
React comparison. Sixteen additional Node string/stream output cases match the
retained artifact. Sampled duplicate encodings all produce equal strings.

The adjacent archive contains 14 SHA-256-verified files covering builder generation,
instrumented artifact/worker, runner, raw capture, summary, parity check and original
artifacts. Measurement hashes and archived contents were verified. All owned
processes exited; only the user's Codex Node remained. No production or public
documentation change, package acceptance, or browser validation is claimed.
