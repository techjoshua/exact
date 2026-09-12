# Conditional await checkpoint experiment, September 12, 2026

Status: focused Node string experiment. Production code and compiler output are unchanged.
Source baseline: `24c94d22`. This tests a pass-through continuation helper after real host
HTTP data loading, not yet component task resumption inside generated programs.

## Implementation

```js
function resumeAfter(value, resume, checkpoint) {
	if (!(value instanceof Promise)) return resume(value);
	return value.then((result) => {
		const scheduled = checkpoint();
		return scheduled ? scheduled.then(() => resume(result)) : resume(result);
	});
}
```

This internal diagnostic accepts immediate values or native promises. Immediate values
remain synchronous and do not consult the policy. Pending values consult the existing
Node adaptive controller after settlement. A disabled policy continues in the same
callback; an enabled policy uses the shipping bounded scheduler. This still allocates
promise continuations for pending values. It does not eliminate promise overhead.

The candidate retains admission before data loading and adds this checkpoint afterward,
using one controller with one request observation and completion listener pair. It passes
the loaded value through an identity callback into the existing render path. Cancellation
is checked after queued admission and after queued data readiness. React is unchanged.

## Measurement

Node 26.8.1, production, full document and application rendering with fresh HTTP data on
every request. Two drivers provide total concurrency 32. Each capture has five seconds
of warmup and eight measured seconds per participant, with two populations reversing
framework order. Policy order is current, candidate, current. Artifact hashes are checked
before and after each capture. Full response hashes and expected application text are
validated. PC usage may vary.

RPS values retain both populations. Latencies use the larger of the two drivers' percentiles
in each population; they are not pooled population percentiles.

| Capture          |     eXact RPS |     React RPS |  eXact p95 ms |  eXact p99 ms |
| ---------------- | ------------: | ------------: | ------------: | ------------: |
| 0-string-current | 2,498 / 2,512 | 2,731 / 2,672 | 15.91 / 15.82 | 17.73 / 18.41 |
| 1-string-both    | 3,411 / 2,984 | 2,702 / 2,695 | 13.22 / 14.78 | 15.35 / 16.57 |
| 2-string-current | 2,519 / 2,517 | 2,742 / 2,682 | 15.78 / 15.71 | 17.54 / 17.77 |

All three captures completed, with zero errors and invalid responses across 12 participant
blocks. Focused helper checks cover synchronous values, immediate and queued continuations,
and rejection from data, queue, or policy. Owned workers and load processes are closed by
the runner. Raw captures, scripts, and logs are in the
[evidence archive](ssr-conditional-checkpoint-2026-09-12.zip).

## Interpretation

Both candidate populations exceed all four nearby current-path eXact samples and their
nearby React controls, with lower eXact p95 and p99. This supports using a conditional
continuation checkpoint at data readiness. It does not establish the best placement inside
component execution, the helper's cost relative to the previous direct checkpoint, or
behavior on Bun, streaming, sparse traffic, and long-duration overload. The next compiler
experiment must distinguish task settlement from transport drains and avoid repeated
yields as completion propagates through nested programs.
