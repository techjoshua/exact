# Document-tail publication optimization, September 9, 2026

Status: retained in the SSR source and rebuilt comparison artifacts. The overall performance goal
remains open. This report includes fresh profiles of the preceding scalar-root build and a focused
experiment derived from those profiles.

## Profile findings

Eight sequential CPU profiles cover eXact and React on Node small/large strings, Bun large strings,
and Bun large streams. The profiles use the frozen scalar-root build, the portable React bundle,
production mode, full application-owned documents, empty asset tags, and fully consumed streams.
Small cases use 100,000 measured iterations, large cases 20,000, each after 5,000 warmups. CPU capture
also includes startup and warmups; profiler timings are diagnostic, not replacement benchmark rates.
Self-sample percentages are not directly additive measures of the performance gap between frameworks.

Useful observations before the document-tail change:

- Node eXact large strings: GC 10.37%, generated incident hydration projector 7.79%, serializeJson
  7.42%, validatePositionalValue 4.72%. React's GC share is 2.84% in that capture.
- Node eXact small strings: GC 11.69%, positional validation 5.25%, opaque operation construction
  3.91%. React's GC share is 3.70%.
- Bun eXact large strings: byteLength 11.19%, positional validation 6.72%, text escaping 4.76%.
- Bun eXact large streams: Response.text consumer work 10.45%, byteLength 6.76%, text escaping
  5.71%, progressiveHtmlChunk 5.42%, stringify 5.32%.

Parent-stack aggregation places Bun byteLength samples in SsrOutputBuffer.charge reached through
append at root output commitment. It does not establish that byte checks are redundant. Node's
allocation/GC and hydration projection warrant further investigation. Consumer work in Bun's
Response.text benchmark must be distinguished from the actual HTTP response adapter.

## Hypothesis and change

The progressive shell path lowercased the entire document to locate its last closing body tag.
For canonical compiler output ending in `</body></html>`, a suffix check determines that position
without traversing or copying the body. Hypothesis: 1-4% lower large streaming render time.

The isolated prototype replaced both whole-string searches with the suffix check and retained the
original case-insensitive search otherwise. Production code centralizes that lookup in document.ts
and uses it for progressive shell publication and string document augmentation. Existing chunked
string augmentation already searches backwards from the tail and is unchanged. This does not
change document ownership, hydration insertion, byte accounting, or publication order.

## Focused streaming results

Each stage has 20 fresh-process populations: Node/Bun, large 96 incidents with three alternating-order
pairs and small 3 incidents with two. Each population warms 5,000 renders and measures 12,000. All
streams are fully consumed, document framing is checked, and final full-response hashes must match
the retained scalar-root control. Lower microseconds per render is better. Paired reduction is the
median of per-round percentage reductions, not a ratio of independent medians.

| Stage | Runtime | Size | Previous us | Candidate us | Paired reduction |
| --- | --- | --- | ---: | ---: | ---: |
| prototype | node | large | 202.47 | 194.90 | +3.0% |
| prototype | node | small | 47.37 | 45.49 | +3.9% |
| prototype | bun | large | 305.38 | 297.09 | +2.7% |
| prototype | bun | small | 48.90 | 44.48 | +8.8% |
| rebuilt | node | large | 200.92 | 191.90 | +4.9% |
| rebuilt | node | small | 48.77 | 44.25 | +9.0% |
| rebuilt | bun | large | 311.63 | 295.17 | +5.3% |
| rebuilt | bun | small | 48.60 | 45.46 | +6.4% |

The rebuilt implementation improves all ten paired streaming comparisons. Large medians of paired
reductions are 4.9% on Node and 5.3% on Bun. Small paired reductions vary more widely, so their larger
median gains should not be treated as precise estimates. The code is retained with all validation
passing and identical document hashes.

These short runs remain susceptible to shared-PC interference. The prototype had one slower Bun
large pair. React was profiled, but not included in these unprofiled before/after timing pairs.
The preceding scalar-current report remains the latest direct comparison against React. This change
does not establish that the outstanding string or large Bun stream gap has closed. No new HTTP RPS
or browser timing result is claimed.

## Validation and evidence

All 280 SSR tests, test type checking, 56 production browser checks, affected-file lint, architecture,
JSDoc, explicit-any, platform boundaries, compiled/frozen ABI, and package-content checks pass.
The comparison client and Node/Bun server targets were rebuilt. New publication tests preserve
canonical/mixed-case/trailing-whitespace tails, exact hydration placement, and rejection of missing
body closures. Existing tests retain shell-before-hydration behavior and blocked-task settlement.
The API and ABI are unchanged by this helper extraction. Engineering documentation is updated;
public documentation and historical performance charts require no behavioral change.

The evidence archive contains profiles, summaries, caller analysis, all raw timing populations,
source and bundle snapshots, fixed data, runners, and validation logs. Profiling used scalar-current;
tail-current is the subsequent retained build. Benchmark/browser child processes are released after
completion.
