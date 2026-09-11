# Direct server lists, September 10, 2026

Status: renderer experiment and source integration. This report follows the
[caller-owned writer integration](caller-owned-writer-integration-2026-09-10.md).

## Profile and hypothesis

Fresh production Node and Bun profiles use the retained shared-invoker artifact and React, with
100,000 small-document string renders after warmup. The complete application-owned document has
four build asset tags. CPU samples are diagnostic, not throughput results. Frames at the same
source location are aggregated across calling contexts.

Node eXact has 11.35% of samples in garbage collection, versus React's 2.87%. Opaque-operation
creation accounts for 3.28% of eXact samples, fragment receipt creation for 2.22%, and prepared
render-program creation for 3.16%. These observations do not prove greater total allocated bytes
or identify a leak. They motivate examining the lifetime and representation of those allocations.
Bun's sample population is smaller; its largest frames include document prefix inspection and
positional validation. Asset parsing is present in both applications and remains unchanged.

The direct server frame's map helper constructed a generic fragment receipt with metadata and
private registration, then SSR immediately redeemed it to render its children and key. Hypothesis:
retaining a direct server list carrier could reduce small-document render time by 2-6% without
changing traversal. An older fragment prototype script had been written but not executed; the new
prototype is applied to the current shared-invoker build and actually measured here.

## Implementation and contract

The server-only helper now retains already-issued keyed children in a realm-branded, request-local
list carrier. The existing fragment renderer still owns marker identity, child order, backpressure,
and descendant lifetimes. Generic authored fragments continue to use their enhancement-capable
receipts. The direct map helper cannot attach enhancements to its container. No second renderer,
sink-type branch, client marker change, or new application API is introduced.

The iterable is still fully materialized before item callbacks, and each render callback precedes
its key callback. Key coercion occurs after child construction, as before. Scheduled child issuance
remains in the component issuer, independent of the list container. The optimization does not cache
request values or reuse mutable component state across requests.

## Paired renderer measurements

Each population runs in a fresh production process, warms 5,000 renders, and measures 8,000. Two
reversed-order populations cover each runtime/mode/document combination. Table entries are means
in microseconds per render, lower is better. Complete eXact document hashes match across variants.
String mode returns a complete string; encoded additionally constructs and consumes a Response
for each render. Stream mode consumes every stream through Response.text. These are renderer and
consumer measurements, not HTTP request rates. The host is shared and short-run variation remains.

| Stage     | Runtime | Mode    | Document | Previous | Direct list |  React |
| --------- | ------- | ------- | -------- | -------: | ----------: | -----: |
| prototype | node    | string  | small    |    36.51 |       33.13 |  22.04 |
| prototype | node    | string  | large    |   168.28 |      168.57 | 130.92 |
| prototype | node    | stream  | small    |    57.07 |       53.80 |  67.85 |
| prototype | node    | stream  | large    |   194.55 |      198.31 | 329.08 |
| prototype | bun     | string  | small    |    39.09 |       36.22 |  31.31 |
| prototype | bun     | string  | large    |   219.28 |      211.13 | 182.27 |
| prototype | bun     | stream  | small    |    55.78 |       53.61 |  51.95 |
| prototype | bun     | stream  | large    |   302.95 |      292.07 | 263.61 |
| rebuilt   | node    | string  | small    |    34.96 |       33.72 |  22.31 |
| rebuilt   | node    | string  | large    |   168.84 |      165.99 | 131.32 |
| rebuilt   | node    | encoded | small    |    53.75 |       51.23 |  33.57 |
| rebuilt   | node    | encoded | large    |   204.35 |      197.03 | 182.08 |
| rebuilt   | node    | stream  | small    |    57.79 |       55.03 |  67.40 |
| rebuilt   | node    | stream  | large    |   199.64 |      192.21 | 334.11 |
| rebuilt   | bun     | string  | small    |    39.62 |       36.76 |  33.63 |
| rebuilt   | bun     | string  | large    |   218.69 |      209.05 | 184.29 |
| rebuilt   | bun     | encoded | small    |    40.40 |       39.04 |  37.54 |
| rebuilt   | bun     | encoded | large    |   220.41 |      218.39 | 199.60 |
| rebuilt   | bun     | stream  | small    |    57.59 |       54.15 |  52.09 |
| rebuilt   | bun     | stream  | large    |   302.49 |      294.49 | 266.13 |

The rebuilt variant improves all twelve case averages, though some large-document changes are
small and individual pairs vary. The direct list representation is retained: it removes the
generic receipt round trip and preserves the shared fragment renderer. This does not establish
React parity in the remaining string and Bun streaming cases.

## Validation

All 336 SSR tests pass, including added comparisons against generic fragment output for empty and
populated lists, marked/unmarked output, and escaped keys. Tests preserve iterable snapshot and
callback order, and verify scheduled-child disposal after completion and cancellation.

Typechecking, compiled ABI compatibility, platform boundaries, affected-file lint, source
architecture, JSDoc, and package contents pass. The canonical eXact client and both server targets
were rebuilt. All 56 production browser checks pass across Node/Bun and string/stream modes,
including hydration, navigation, live updates, focus preservation, and failure recovery. No ABI
fixture was regenerated. This stage does not rerun browser performance timings.

## Paired HTTP comparison

The previous shared-invoker build was frozen separately for Node and Bun before rebuilding the
canonical targets. Each runtime/mode uses two reversed-order populations of previous eXact,
current eXact, and React. Workers run in production mode. Two independent drivers each supply 16
concurrent requests, for 32 total, with two seconds of warmup and four seconds measured. Every
completed response is checked against its full-body hash. The three-incident controlled-service
snapshot is preloaded, and every participant renders its complete document with four asset tags.
Node uses its HTTP adapter; Bun uses the native fetch adapter. The shared machine and short run
windows limit precision. These are focused capacity samples, not a replacement public baseline.

| Runtime | Mode   | Previous eXact req/s | Current eXact req/s | React req/s | eXact change |
| ------- | ------ | -------------------: | ------------------: | ----------: | -----------: |
| node    | string |                6,801 |               7,082 |       9,724 |        +4.1% |
| node    | stream |                5,965 |               6,141 |       3,895 |        +3.0% |
| bun     | string |                8,244 |               8,522 |       8,982 |        +3.4% |
| bun     | stream |                6,392 |               6,606 |       6,699 |        +3.3% |

All 24 populations completed with zero response errors. The Node streaming advantage remains.
Bun streaming is approximately 1.4% below React in this capture; that difference is small relative
to shared-host uncertainty and does not establish superiority. Bun strings remain about 5.1%
below React, and Node strings about 27.2% below. The overall objective remains unmet.

The next compiler investigation should examine the emitted continuation scaffolding of small
programs. Two synchronous writes currently select the general state-machine writer, whereas one
terminal write has a compact body. Any alternative must retain readiness after each write and
resume without repeating preparation. This is an investigation target, not an implemented or
measured improvement, and it must continue using the same renderer and sink contract.

The [evidence archive](direct-server-lists-2026-09-10-evidence.zip) preserves raw renderer/HTTP
populations, production profiles, immutable before/prototype/current artifacts, source, validation
logs, runners, and a per-file hash manifest. Reproduction requires the locked workspace and matching
runtime versions. Earlier compiler source and initial-contract evidence remain in the preceding
caller-owned writer archive.
