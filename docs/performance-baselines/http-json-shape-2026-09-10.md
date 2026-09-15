# Hydration payload representation in loops and HTTP

Status: diagnostic completed. No production change.

## Question and method

The preceding trace found native JSON.stringify taking approximately 1.36
microseconds in an isolated loop and 5.06 under HTTP. This follow-up tests whether
the actual payload values or array element representations differ by context.

The split-region diagnostic retains the first eight sampled payload graphs in each
measured phase. Graph inspection occurs at the control response after that phase,
not inside the serialization timer. Two fresh production Node 26.8.1 workers use
the same warmup, loop/HTTP/loop ordering, one-in-64 timing sampling, below-normal
priority, preloaded fixture and full document as the preceding trace.

V8 internal diagnostics inspect element kinds and compare each array's map with
the corresponding array in that worker's first captured graph. These are isolated
diagnostic helpers, not a framework dependency or portable API. The native-syntax
flag is enabled only in owned diagnostic workers. No user process is modified.

## Findings

All 48 captured graphs agree in JSON and inspected structure:

| Property                                                    | Loop before | HTTP | Loop after |
| ----------------------------------------------------------- | ----------: | ---: | ---------: |
| Arrays                                                      |          19 |   19 |         19 |
| JSON bytes                                                  |         715 |  715 |        715 |
| Arrays with holey element representation                    |          12 |   12 |         12 |
| Arrays with packed element representation                   |           7 |    7 |          7 |
| Actual missing array indices                                |           0 |    0 |          0 |
| Arrays with a different map from the worker's first capture |           0 |    0 |          0 |

There are no non-array object containers, accessors, symbol properties, toJSON
properties or replacer callback in the captured graphs. Every array has the normal
Array.prototype. Lengths, present-index counts, extensibility, element-kind flags
and JSON agree across captures. Map identity is compared within a worker; separate
processes cannot share V8 map identity.

Holey is V8's storage classification here, not evidence of absent indices.
Switching to HTTP does not change that classification in these samples. This rules
out a payload-value or observed array-representation change as the explanation for
the timing increase in the captured fixture. It does not establish why native
encoding slows, inspect string internals, or rule out memory locality and runtime
effects. Inspection occurs after serialization, and the sample is finite.

## Timing and validation

The instrumented slowdown repeats: native encoding averages 1.44 microseconds
before HTTP, 5.12 under HTTP and 1.34 afterward. Escaping averages 0.85, 1.92 and
0.81. Retaining sample graphs and wrapping functions perturb execution, so these
are diagnostics rather than unbiased production timing or recoverable savings.

Measured HTTP rates are 8,039.21 and 8,340.19 RPS. All 81,976 measured responses
are valid with zero errors. Sixteen additional Node string/stream cases match the
retained uninstrumented document output. This is not a React comparison, public
baseline refresh, or package/browser acceptance run.

The adjacent archive contains 15 SHA-256-verified files, including instrumentation,
worker/runner, raw captures, all graph observations, verification script, timing
summary, fixture and original artifacts. Measurement artifact hashes and archive
contents were verified. All owned processes exited; only the user's Codex Node
remained. Production code and public documentation are unchanged.
