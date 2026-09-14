# Caller-owned SSR writer integration

Status: integration and performance experiments in progress. The sink remains opaque to compiled
components. Components use ordinary writer operations; they do not inspect sink type or mutate a
string accumulator directly. The collecting sink retains `+=` accumulation.

The compiler now supplies caller-owned output as a fourth writer argument. Generated writers
publish to that sink and continue through actual child or sink suspension. They no longer return
an intermediate segment array for a second traversal. Prepared scheduled siblings retain their
existing startup and disposal ownership. Public document streams still collect the rendered shell
before publishing it, so this change alone does not establish progressive head delivery during
tree traversal.

## First cutover measurement

Removing the intermediate arrays was expected to help allocation and traversal cost. The first
integrated implementation instead regressed. These are mean microseconds per complete document
from two reversed-order samples, lower is better:

| Runtime | Mode   | Document | Previous array writer | Caller-owned writer |  React |
| ------- | ------ | -------- | --------------------: | ------------------: | -----: |
| Node    | String | Small    |                 35.65 |               36.98 |  22.04 |
| Node    | String | Large    |                168.58 |              178.55 | 128.75 |
| Node    | Stream | Small    |                 55.97 |               57.58 |  67.21 |
| Node    | Stream | Large    |                198.98 |              212.89 | 350.53 |
| Bun     | String | Small    |                 35.85 |               41.78 |  32.01 |
| Bun     | String | Large    |                227.20 |              265.12 | 188.14 |
| Bun     | Stream | Small    |                 50.54 |               60.59 |  54.24 |
| Bun     | Stream | Large    |                275.19 |              332.45 | 274.00 |

This result does not support a performance-win claim for the architectural cutover.

## Completion ownership experiment

Inspection found unconditional completion closures even when a writer completed synchronously
without prepared sibling cleanup. The experiment allocates those callbacks only for pending work
or owned cleanup. The hypothesis was a 3–8% improvement from eliminating that repeated work.
An independent four-variant run produced these large-document means:

| Runtime | Mode   | Previous array writer | Initial cutover | Conditional completion |  React |
| ------- | ------ | --------------------: | --------------: | ---------------------: | -----: |
| Node    | String |                164.78 |          183.15 |                 173.76 | 133.92 |
| Node    | Stream |                198.79 |          217.67 |                 210.65 | 348.78 |
| Bun     | String |                244.28 |          273.49 |                 247.41 | 183.45 |
| Bun     | Stream |                293.70 |          352.46 |                 320.47 | 276.90 |

Conditional completion helps the new path but does not establish parity with React or erase
every regression relative to the previous writer. Retain the raw samples when interpreting these
means: this is a shared workstation, and the Bun streaming initial-cutover samples varied widely.

## Boundary completion experiment

Marker-free children still passed through nested completion closures and an additional readiness
check after an empty closing span. The revised boundary keeps synchronous completion direct,
allocates callbacks for actual suspension, and omits that final check only when no closing span
was written. Opening pressure still precedes child work; child output drains before a closing
marker; failures do not emit closing markers.

The focused large-document comparison used 8,000 measured renders per sample:

| Runtime | Mode   | Conditional completion | Boundary optimization |  React |
| ------- | ------ | ---------------------: | --------------------: | -----: |
| Node    | String |                 175.47 |                174.26 | 131.78 |
| Node    | Stream |                 202.26 |                196.10 | 333.46 |
| Bun     | String |                 234.93 |                224.27 | 187.42 |
| Bun     | Stream |                 329.19 |                315.06 | 275.51 |

Node string results are close enough that this run does not establish a meaningful gain there.
The Bun samples consistently favor the boundary optimization.

## Measurement and validation scope

Each process uses production mode, constructs the framework's complete app-owned document, and
verifies the doctype, closing body/HTML tags, four supplied assets, and the complete eXact HTML
hash. Small and large documents use 3 and 96 incident records. String measurements await the
returned document; stream measurements consume the full response body. These are renderer and
stream-consumption measurements, not HTTP requests per second or browser-navigation benchmarks.
React resolves from its actual comparison participant, not a copied entry that could resolve a
different React installation. Runtimes are Node 26.8.1 and Bun 1.4.2.

The first two experiments use 12,000 measured renders after up to 5,000 warmups. All comparisons
use fresh sequential processes and reversed variant order in their second round. Builds and
tests do not run concurrently with timing samples. Cross-batch absolute times are not paired
comparisons.

Validation so far includes all native compiler tests, compilation of all eXact packages,
regeneration and typechecking of application artifacts, 334 selected SSR/compiler tests, a
separate 182-test reactive/compiler check, platform boundaries, package contents, source
architecture, JSDoc, and the explicit-any ratchet. Test selections overlap. The initial 0.5.0 ABI
fixture passes tasks, updates, keyed identity, SSR, hydration adoption, and disposal. Physical
browser performance has not been measured for these experiments.

The fixture exposed a preexisting numeric-key declaration mismatch. Core/reactive helper types
now accept string or numeric selectors, matching the runtime's existing string normalization.
This adds no runtime work. Generated TypeScript has regression coverage for numeric keyed rows
and recursive continuation writers in both target projections.

This is an incompatible prepublication writer ABI redesign under the approved initial 0.5.0
contract. The preceding development fixture and its original integrity manifest are preserved in
[the development fixture archive](prepublication-array-writer-fixture-2026-09-10.zip). No published
artifact was regenerated to claim backward compatibility.

## Rejected compiler-state experiment

Removing result-settlement states for synchronous writes preserved sink-pressure checkpoints and
passed the 334 selected tests, but did not meet the tentative 5–10% Bun hypothesis:

| Runtime | Mode   | Boundary optimization | Folded synchronous states |  React |
| ------- | ------ | --------------------: | ------------------------: | -----: |
| Node    | String |                167.41 |                    170.22 | 131.03 |
| Node    | Stream |                194.55 |                    196.13 | 352.78 |
| Bun     | String |                220.33 |                    222.37 | 185.47 |
| Bun     | Stream |                304.46 |                    301.33 | 273.64 |

The change was reverted. The isolated emitted artifact and emitter source are retained with the
experiment evidence. The original continuation compiler was rebuilt and all packages compiled
again after restoration.

## String-length metadata

The collecting sink no longer maintains a separate character counter. It uses the accumulated
string's stored UTF-16 length instead. This preserves early size rejection, prefix accounting,
cross-write surrogate handling, and the final UTF-8 upper-bound proof. Reading length metadata
does not resolve the characters of a rope, as shown by the
[V8 implementation](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/objects/string-inl.h)
and [JavaScriptCore implementation](https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/JSString.h).

The hypothesis was less than 1% throughput change, with simpler retained state as the main benefit.
Fourteen size-limit tests and the frozen ABI check pass. The string-only timing guard used 8,000
measured renders per sample:

| Runtime | Document | Separate counter | Stored length |  React |
| ------- | -------- | ---------------: | ------------: | -----: |
| Node    | Small    |            36.81 |         36.42 |  22.67 |
| Node    | Large    |           168.22 |        169.28 | 130.63 |
| Bun     | Small    |            41.46 |         40.14 |  31.33 |
| Bun     | Large    |           221.51 |        221.75 | 183.37 |

Large-document differences are small. Retain the simpler implementation without claiming a
large rendering improvement or weakening the output-size limit.

## Production profile findings

Fresh Node and Bun profiles compare the boundary-optimized artifact with React in production
mode, using 40,000 large-document string renders after warmup. Profile timings are instrumented
and are not throughput samples. The production-profile harness explicitly sets `NODE_ENV` for
every subprocess.

`startsExactDocument` accounts for approximately 6% of Node samples and 10% of Bun samples. It
indexes characters of the completed document, unlike the constant-time length metadata read.
The generated positional state encoder, positional validation, and JSON serialization are also
prominent. Node's garbage-collection sample count is substantially higher for eXact. These profiles
motivate examining document-boundary metadata and hydration encoding before further small
continuation changes. Merely replacing one prefix-probe API with another did not help in the
earlier native-document-probes experiment.

## Document finalization experiments

These isolated artifact prototypes test whether avoiding completed-document inspection can reduce
the profiled prefix-probe cost. A body checkpoint retains the closing body/html span separately;
the rope variants replace lazy final chunk joins with local string concatenation. They do not
introduce another renderer. Neither prototype is retained in production.

All tables below report mean microseconds per render across two reversed-order fresh-process
populations, with 5,000 warmups and 8,000 measured renders each. They use the large 96-incident
application-owned document with four asset tags. Complete eXact document hashes match the control.
The workstation remains shared, so these are focused observations, not precise confidence bounds.

The initial checkpoint still uses the existing final joins:

| Runtime | Mode   | current | checkpoint |  react |
| ------- | ------ | ------: | ---------: | -----: |
| node    | string |  168.22 |     255.87 | 129.79 |
| node    | stream |  202.17 |     195.75 | 335.26 |
| bun     | string |  221.50 |     245.29 | 182.71 |
| bun     | stream |  303.94 |     304.96 | 259.38 |

The next comparison tests ordinary rope finalization and checkpoint-plus-rope finalization.
Here encoded includes constructing a Response from the rendered string and awaiting its text
consumption on every iteration. It guards against moving flattening out of the timed renderer;
it includes encoding/decoding overhead and is not an HTTP throughput measurement.

| Runtime | Mode    | current |   rope | checkpoint |  react |
| ------- | ------- | ------: | -----: | ---------: | -----: |
| node    | string  |  166.80 | 157.48 |     195.35 | 130.10 |
| node    | encoded |  199.34 | 204.79 |     262.40 | 180.88 |
| bun     | string  |  225.41 | 214.89 |     213.94 | 185.71 |
| bun     | encoded |  225.20 | 230.43 |     250.19 | 197.63 |

Returning an unconsumed rope can appear faster while response consumption erases or reverses the
gain. The checkpoint prototype is also slower on the string path. No finalization implementation
or public document-publication contract changes on the strength of these results.

## Adjacent writer grouping

The old array writer combined adjacent text before handing it to the sink. The caller-owned
writer instead sends completed pieces directly. Hypothesis: restoring grouping without deferred
segment arrays would improve large renders by 5-15% through fewer sink calls.

The source experiment retains pending text on each program output, publishes before child
traversal and completion, waits for sink pressure, and releases pending text on failure. All 331
SSR tests passed and the isolated application was rebuilt with the current native compiler.

| Runtime | Mode    | current | grouped |  react |
| ------- | ------- | ------: | ------: | -----: |
| node    | string  |  168.74 |  169.79 | 130.95 |
| node    | encoded |  209.88 |  205.59 | 180.38 |
| node    | stream  |  198.49 |  199.13 | 333.81 |
| bun     | string  |  223.21 |  239.77 | 187.22 |
| bun     | encoded |  228.18 |  234.48 | 196.32 |
| bun     | stream  |  319.93 |  304.97 | 267.23 |

The result is mixed: Bun streaming improves, but Bun strings regress, including consumed strings.
Node plain strings and streams change little. Grouping also adds another buffering owner above
the sink. The source experiment is reverted and preserved in the evidence archive, together with
the artifact and raw populations. The retained implementation remains the metadata-length writer
with conditional completion and direct boundary handling. No sink-type branch is generated.

## Production browser validation and timings

The canonical eXact client, Node server, and Bun server artifacts were rebuilt after the writer
cutover and grouping reversion. All 56 production browser checks passed across Node/Bun and
string/stream modes. They cover hydration, navigation, updates, focus preservation, validation,
transport failure recovery, and event-stream reconnect. They are correctness checks, not timings.

A separate timing capture uses 20 fresh browser contexts per participant and profile, after one
warmup each. Each navigation performs an actual production Node streaming render using the same
HTTP transport, with asset and full-response hashes recorded. Participant order rotates. The
constrained profile uses 4x CPU throttling, 40 ms network latency, and 10 Mbps throughput each
direction. No artificial hydration delay is injected. Table entries are medians in milliseconds.

| Profile     | Participant | Navigation | DOM content loaded | First paint | Live readiness | Optimistic feedback | Settlement |
| ----------- | ----------- | ---------: | -----------------: | ----------: | -------------: | ------------------: | ---------: |
| local       | exact       |      29.35 |              13.50 |       44.00 |          49.90 |                1.60 |      13.85 |
| local       | react       |      36.25 |              20.30 |       52.00 |          51.80 |                1.50 |      13.90 |
| constrained | exact       |     315.95 |             315.80 |      240.00 |         461.15 |                8.30 |      16.00 |
| constrained | react       |     347.40 |             347.20 |      240.00 |         464.95 |                7.35 |      23.00 |

This is a current eXact-versus-React capture, not a paired old-versus-new browser comparison. It
does not establish that the writer cutover caused the observed loading advantage. This capture
precedes the shared-invoker optimization below. No public benchmark chart is replaced by these
focused results.

## Shared writer invocation

The caller-owned writer originally allocated a wrapper closure for every prepared program. The
candidate passes the existing invocation explicitly to one shared invoker. Program output,
document ancestry, preparation disposal, sink pressure, and compiler writer signatures are unchanged.
The hypothesis was a 1-3% improvement from eliminating that per-position allocation. The renderer
and components still use one sink contract.

The isolated prototype was followed by a source rebuild. The latter also covers small documents
and response consumption. Each cell is the mean of two reversed-order fresh-process samples,
with 5,000 warmups and 8,000 measured renders per sample. Units are microseconds per render.

| Stage     | Runtime | Mode    | Document | Previous | Shared invoker |  React |
| --------- | ------- | ------- | -------- | -------: | -------------: | -----: |
| prototype | node    | string  | large    |   169.11 |         166.56 | 128.83 |
| prototype | node    | encoded | large    |   205.14 |         207.02 | 179.59 |
| prototype | node    | stream  | large    |   199.74 |         195.06 | 334.10 |
| prototype | bun     | string  | large    |   220.27 |         218.01 | 185.56 |
| prototype | bun     | encoded | large    |   229.13 |         223.44 | 199.50 |
| prototype | bun     | stream  | large    |   305.94 |         299.77 | 262.67 |
| rebuilt   | node    | string  | small    |    36.83 |          36.29 |  23.73 |
| rebuilt   | node    | string  | large    |   170.67 |         169.03 | 133.98 |
| rebuilt   | node    | encoded | small    |    55.61 |          55.24 |  33.82 |
| rebuilt   | node    | encoded | large    |   200.46 |         203.60 | 184.64 |
| rebuilt   | node    | stream  | small    |    57.93 |          56.62 |  66.15 |
| rebuilt   | node    | stream  | large    |   193.64 |         193.16 | 333.41 |
| rebuilt   | bun     | string  | small    |    40.72 |          39.15 |  31.35 |
| rebuilt   | bun     | string  | large    |   221.56 |         217.30 | 182.14 |
| rebuilt   | bun     | encoded | small    |    42.04 |          40.85 |  37.60 |
| rebuilt   | bun     | encoded | large    |   232.24 |         224.01 | 201.84 |
| rebuilt   | bun     | stream  | small    |    58.30 |          56.11 |  53.19 |
| rebuilt   | bun     | stream  | large    |   310.20 |         301.36 | 262.71 |

The shared invoker is retained. Eleven of twelve rebuilt case averages improve, with modest
changes and shared-PC noise. Large Node strings including Response consumption regress by 1.6%;
the prototype showed the same direction. This is a documented tradeoff, not a claim of uniform
improvement. Eliminating the wrapper allocation and improving the other measured paths justify
the small internal change without introducing another rendering engine or sink-specific code.

The rebuilt source passes all 331 SSR tests, test typechecking, compiled ABI compatibility,
platform boundaries, affected-file lint, source architecture, JSDoc, and package-content checks.
The initial ABI fixture is unchanged by this optimization. Canonical client and both server
targets were rebuilt again, and all 56 Node/Bun string/stream browser checks passed on the retained
implementation. Browser timing artifacts from the
preceding capture are preserved separately under `.tmp/ssr-large-profile/cutover-browser-artifacts`
in the evidence archive, since the canonical build paths now contain the shared invoker.

The performance goal remains unmet. The rebuilt large string case takes 169.03 microseconds on
Node against React's 133.98, and 217.30 on Bun against 182.14. Large streams take 193.16 on Node
against 333.41, but 301.36 on Bun against 262.71. Small Node strings remain the largest relative
renderer gap. Focused renderer and browser results do not replace a full HTTP/client baseline.

The [evidence archive](caller-owned-writer-integration-2026-09-10-evidence.zip) contains raw paired
populations, immutable experimental artifacts, current source, rejected source variants, production
profiles, browser captures, validation logs, and a per-file integrity manifest. Unprefixed profiles
from the accidentally non-production diagnostic run are excluded. Reproduction requires the locked
workspace dependencies and matching runtimes; the archive is evidence, not a standalone distribution.
