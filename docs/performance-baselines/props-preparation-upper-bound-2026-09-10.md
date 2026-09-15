# Component-prop preparation upper bound, September 10, 2026

Status: diagnostic only. No production change. The bypass is unsafe for general applications
because it omits resolution of compiler-propagated component and task dependencies.

## Audit and hypothesis

The retained build's prepareComponentProps enumerates own inputs, excludes deferred task inputs,
and checks object/function values for dependency sources. Ordinary values already pass through
without a props copy. The fresh Bun profile attributed 3.61% of samples to this function.

Instrumentation on the actual full-document fixtures found these counts per render:

| Size                | Preparation calls | Visited fields | Object/function lookups | Sources found |
| ------------------- | ----------------: | -------------: | ----------------------: | ------------: |
| Small               |                 8 |             18 |                       5 |             0 |
| Large, 96 incidents |               101 |            111 |                       5 |             0 |

Each raw audit executes one warmup plus one render, so its counters are twice these values.
Node and Bun agree. The extra large-document calls correspond to repeated SeverityBadge
components with scalar severity props. The absence of sources is a property of these fixtures,
not a compiler proof about arbitrary applications.

Hypothesis: removing all preparation could save roughly the sampled 2-4% on small documents
and potentially more when repeated scalar-only components increase the call count. This measures
the opportunity before designing safe compiler assistance. The isolated bypass returns props
unchanged and is never eligible for production adoption as written.

## Measurements

Seventy-two fresh production processes compare retained eXact, the diagnostic bypass, and React
in two reversed variant orders. Each has 5,000 warmups and 10,000 measured renders. Both applications
own their complete document and render four asset tags. Encoded mode consumes string output
through Response.text(); stream mode fully consumes the framework stream. Complete eXact hashes
match. These are microseconds per render, lower is better, not HTTP throughput.

| Runtime | Mode    | Size  | Current | Preparation bypass |  React |
| ------- | ------- | ----- | ------: | -----------------: | -----: |
| node    | string  | small |   33.19 |              32.16 |  21.84 |
| node    | string  | large |  166.86 |             159.26 | 129.05 |
| node    | encoded | small |   50.05 |              48.65 |  33.24 |
| node    | encoded | large |  206.79 |             199.50 | 180.20 |
| node    | stream  | small |   52.72 |              52.47 |  65.86 |
| node    | stream  | large |  196.45 |             188.71 | 335.82 |
| bun     | string  | small |   36.59 |              35.74 |  31.68 |
| bun     | string  | large |  212.96 |             199.60 | 184.18 |
| bun     | encoded | small |   38.08 |              37.29 |  39.31 |
| bun     | encoded | large |  216.88 |             210.39 | 205.84 |
| bun     | stream  | small |   53.11 |              51.83 |  52.54 |
| bun     | stream  | large |  296.49 |             284.71 | 264.02 |

The large string means improve by approximately 4.6% on Node and 6.3% on Bun. This supports
investigating safe compiler-assisted preparation. It does not show that all of that saving is
recoverable, isolate an individual enumeration or lookup cost, or establish confidence intervals.
The bypass still does not beat React's string-rendering means. All raw populations are retained.

## Design constraints and next action

Do not infer settled values from TypeScript prop types alone: compiler-propagated pending values
can represent those inputs. Do not skip preparation for all stateless components; their inputs
can still depend on scheduled work. Prepared server references may retain their original props
object, so a generic runtime optimization must not assume every bag is a fresh plain data object.
Live ownership checks and authored access behavior must be preserved.

A next experiment should evaluate explicit compiler proof or construction-time knowledge for
finite scalar prop bags, while retaining ordinary preparation for dynamic or pending values.
That requires measuring the overhead of the proof itself and protecting task settlement,
cancellation, and input ownership. No second rendering engine or sink-specific component API is
proposed. Full package/browser validation is unnecessary for this discarded diagnostic bypass;
it will be required for any actual implementation.

Audit scripts, instrumented and bypass artifacts, raw captures, runners, and the retained eXact
artifact are preserved in props-preparation-upper-bound-2026-09-10-evidence.zip. Production
remains the static-input reuse build. The overall performance objective is still unmet.
