# Compiled document components, September 9, 2026

Retained: ordinary component render programs now handle document hosts, coalesce proven static
children, and preserve existing dynamic child adoption boundaries. String and streaming output
continue to use the same renderer. No shell-specific public API or application workaround was added.

The [preceding profile](ssr-program-profile-2026-09-09.md) identified generic document operations as
avoidable work and proposed a 5 to 10% small-document rendering improvement. This implementation
reduces median small-document rendering time by 9.4 to 17.5% for strings and 7.0 to 16.8% for streams
in the focused samples. Median HTTP throughput improves in all four runtime/output combinations.
The large string workload changes little. These results do not establish parity with React across
workloads or replace the historical public benchmark charts.

## Retained implementation

- The native compiler emits `ssrHost` metadata identifying a server program's root intrinsic.
  An explicit, ordered head/body pair can form a compiled HTML program. Incomplete, reordered,
  conditional, or ambiguous document structure retains runtime normalization and rejection.
- HTML, head, and body remain ordinary authored component markup. Document host identities remain
  available to ordinary client adoption. Static children can share the surrounding program, while
  dynamic expressions, lists, components, and independently compiled dynamic child regions keep
  their existing adoption boundaries and sibling task issuance.
- The existing ordered output walker retains document ancestry through pending descendants and
  releases it on failure. Ordinary compiled roots invalidate document probing, preventing an
  enclosing compiled main element from concealing an invalid nested HTML document.
- Normalization recognizes both generic intrinsic operations and prepared program roots. It can
  synthesize missing head/body hosts around unambiguous compiled content and rejects duplicates
  or an authored body combined with loose content.
- Document publication still waits for rendering and tasks that can revise the shell. It publishes
  body content before hydration and closing tags; this change does not add traversal-time head
  flushing or weaken cancellation, output limits, or hydration validation.

The implementation belongs to the compiler, core artifact types, and shared SSR traversal. Application
Document components and React implementations were not changed. The initial unreleased 0.5.0 ABI
notes describe the new required program semantics; preserved development fixtures were not regenerated.

## Correctness findings and validation

The initial SSR check caught missing document-host IDs. They were restored in compiler-generated
root props. New composition coverage caught a compiled main concealing nested HTML; root-host
metadata and probing now reject it.

An initial browser round caught a Document hydration mismatch even though SSR tests passed: merging
dynamic regions changed the boundaries expected by the client head lists. The final implementation
coalesces only proven static children and preserves ordinary dynamic child lowering. The corrected
build passes all 56 production browser checks: Node and Bun, string and stream, eXact and React.
These checks include hydration, filtering, optimistic actions, live updates, focus preservation,
validation, empty data, and reconnection. Browser timing was not remeasured and no paint/navigation
improvement is claimed.

Validation completed:

- Native compiler overlay and command tests, plus a final normal build-cache verification.
- 272 SSR, 247 core, and 240 hydration package tests.
- 56 production browser checks across both runtimes and output modes.
- Test type checking, affected-file lint/formatting, JSDoc, explicit-any ratchet, source architecture,
  platform boundaries, and published package contents.
- Frozen compiled ABI fixtures and release ABI checks.
- Documentation application type checking and production build.

## Renderer measurements

Node 26.8.1, Bun 1.4.2, React 19.2.0, production mode. Each framework constructs its own complete
HTML document through its component tree. Three rotated orders of starting eXact, retained eXact,
and React for each runtime, output mode, and workload: 108 fresh-process populations. Each performs
2,000 warmups followed by 6,000 measured renders. Streams are consumed completely with Response.text(),
so these numbers include stream consumption and decoding, not just HTML generation.

Small is the three-incident fixture. Unicode adds 100 repetitions of accented, astral, and Japanese
text to each incident title. Large contains 96 incidents. Median microseconds per complete document,
lower is better. Reduction compares medians within this capture.

| Runtime | Mode   | Workload | Starting eXact | Retained eXact |  React | Time reduction |
| ------- | ------ | -------- | -------------: | -------------: | -----: | -------------: |
| node    | string | small    |          53.93 |          44.49 |  26.01 |          17.5% |
| node    | string | unicode  |          72.63 |          61.72 |  33.61 |          15.0% |
| node    | string | large    |         270.76 |         269.60 | 160.11 |           0.4% |
| node    | stream | small    |          93.88 |          78.14 |  83.55 |          16.8% |
| node    | stream | unicode  |         144.16 |         131.42 | 135.97 |           8.8% |
| node    | stream | large    |         338.56 |         312.27 | 412.75 |           7.8% |
| bun     | string | small    |          47.80 |          43.33 |  33.73 |           9.4% |
| bun     | string | unicode  |          67.89 |          63.71 |  45.17 |           6.2% |
| bun     | string | large    |         369.25 |         367.34 | 210.63 |           0.5% |
| bun     | stream | small    |          69.86 |          65.00 |  63.17 |           7.0% |
| bun     | stream | unicode  |         118.63 |         115.05 |  84.59 |           3.0% |
| bun     | stream | large    |         474.34 |         457.78 | 312.76 |           3.5% |

The smaller gains on large strings fit an optimization focused on document setup. React remains
faster for strings on both runtimes and for Bun streams in these fixtures. The retained eXact
streaming probe is faster on Node in this capture, including stream consumption. These local
samples are not isolated-machine performance guarantees; individual large-workload pairs vary.

## HTTP throughput

Two counterbalanced populations per runtime/output mode/framework variant: 24 populations. Each
uses two independent load-driver processes at concurrency 16, for total concurrency 32. Each driver
warms for 2 seconds and measures for 4 seconds. The application data is preloaded to isolate SSR
from controlled-service fetching. Node uses the existing Node HTTP path; Bun uses native Bun fetch
servers. Both variants use the same current benchmark worker and unchanged production transports.
Every measured response must match its variant's complete raw response identity.

Median valid requests per second, higher is better:

| Runtime | Mode   | Starting eXact | Retained eXact | React | eXact gain |
| ------- | ------ | -------------: | -------------: | ----: | ---------: |
| node    | string |          5,269 |          6,005 | 7,906 |      14.0% |
| node    | stream |          4,725 |          5,158 | 3,303 |       9.2% |
| bun     | string |          6,299 |          6,778 | 7,997 |       7.6% |
| bun     | stream |          5,174 |          5,370 | 5,719 |       3.8% |

All 24 populations completed with zero errors. Both paired populations favored the retained build
in every runtime/output combination. Two populations still provide limited precision. Compare
variants within this capture, not absolute rates with earlier runs under different PC workload.

The Node streaming HTTP advantage includes the previously measured adapter difference: React uses
Readable.fromWeb()/pipeline(), while eXact's adapter consumes the stream directly. This investigation
changes neither React nor those adapters and does not attribute that full advantage to the compiler.

## Removed work and response identity

An instrumented single small-document render confirms the intended work reduction:

| Operation                               | Starting eXact | Retained eXact |
| --------------------------------------- | -------------: | -------------: |
| Opaque operation creation               |              5 |              2 |
| Generic intrinsic receipt creation      |              3 |              0 |
| Prepared server program creation        |             21 |             20 |
| Attribute preparation                   |             25 |             24 |
| Component references / prop preparation |          8 / 8 |          8 / 8 |
| Positional validation visits            |             40 |             40 |
| JSON serialization                      |              1 |              1 |

These are helper invocation counts, not allocation totals. Hydration validation was not removed.
The retained empty asset lists still own two generic fragment operations for ordinary client adoption.

Small documents remain 3,966 bytes for eXact and 3,457 for React. Cross-build raw hashes differ because
the compiler changes request-local fragment ordinals, for example 5/6 become 7/8. The comparison
normalizes only the ordinal field in exact:fragment comments, retaining each comment and its stable
compiler-owned fragment identity. Structural hashes match for all paired renderer workloads, and
normalized complete HTTP documents match across eXact variants. Every build's raw hash and byte
length remain recorded; HTTP drivers validate the entire raw response against that build's own hash.
No production benchmark identity checks were weakened.

## Evidence

[Raw renderer and HTTP measurements](compiled-document-2026-09-09.json) and
[artifacts, input, source snapshots, logs, and scripts](compiled-document-2026-09-09-evidence.zip)
retain this investigation. The evidence archive has a per-file SHA-256 manifest. The starting Node
artifact exactly matches the preceding investigation's final archived artifact; the native Bun
baseline comes from that same final archive. Retained timed artifacts are frozen separately from
later documentation-only edits. Scripts use repository-relative paths and the normal workspace
dependencies. The input snapshot is retained as input.json.

The archive also retains the initial failed checks and the narrowed implementation. Its code patch
is relative to snapshots taken at this task's start, rather than the repository's much older HEAD.
The report and public documentation clarify that existing full charts predate this optimization.
