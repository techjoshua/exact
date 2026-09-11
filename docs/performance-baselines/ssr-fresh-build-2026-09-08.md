# SSR marker build audit, September 8, 2026

This follow-up compares freshly compiled marked and markerless output using the same optimized
synchronous scalar writer. It checks the build provenance behind the earlier
[text-run measurements](ssr-text-runs-2026-09-08.md).

## Build verification

Both variants received a forced TypeScript workspace build, compilation of all configured eXact
package client/server targets, and a fresh comparison application client, Node SSR, and Bun SSR
build. The native compiler was rebuilt for each marker strategy. Snapshots preserve both outputs.

The Node server bundles differ on exactly two lines: the scalar calls for the two expressions in
each row pass `true` for marker omission. Their SSR writer is identical. Both fresh bundles also
match their earlier direct-writer experimental candidates after deterministic minification.
React's server bundle hash is unchanged across builds. The markerless browser bundle contains
the text-run claim and `splitText()` implementation.

The earlier first browser attempt did use a stale conditional DOM output. That was corrected
before the passing browser tests and the later measurements. This forced rebuild found no further
stale server output in the direct-writer candidates.

## Validation

The fresh markerless application passes all 14 eXact/React browser tests. The core, DOM, SSR, and
hydration suite passes 990 tests in 172 files. Native compiler tests, frozen release ABI validation,
and source architecture checks pass. The documentation app passes type checking and its standalone
production build. All benchmark-owned processes were closed after measurement.

## Measurement method

Renderer measurements alternate the two eXact artifacts and React across 24 rounds after warmup.
Each eXact operation renders the same document with its hydration payload. Assertions verify
identical content after comment removal and a 126-byte reduction from omitting the scalar markers.

HTTP uses the ordinary Node adapter and benchmark worker with preloaded data. Two independent
drivers supply 32 total concurrent requests after warmup, followed by 6,000 total offered requests
per second. Two fresh worker populations reverse the participant order. Builds and tests are
stopped during timing. Other workstation activity is uncontrolled. These are targeted comparisons,
not replacements for the full public benchmark suite or claims of peak capacity.

## Results

| Renderer, time per document          | Marked (us) | Markerless (us) | React (us) |
| ------------------------------------ | ----------: | --------------: | ---------: |
| Node 26.8.1                          |       13.70 |           12.89 |      17.28 |
| Bun 1.4.2, same Node-target artifact |       14.16 |           13.47 |      22.69 |

Markerless rendering takes 5.9% less time on Node and 4.9% less on Bun in these captures.
Document sizes are 3,611 bytes marked, 3,485 markerless, and 3,384 for React.

| Node HTTP capacity, valid RPS | Marked | Markerless |  React |
| ----------------------------- | -----: | ---------: | -----: |
| Population 1                  | 10,666 |     11,098 | 12,055 |
| Population 2, reversed order  | 10,750 |     10,160 | 11,519 |
| Mean                          | 10,708 |     10,629 | 11,787 |

Markerless leads marked by 4.0% in the first population and trails by 5.5% in the second.
Its mean is 0.7% below marked and 9.8% below React. This does not establish a repeatable HTTP
advantage for either marker strategy. The earlier stronger regression is not reproduced at the
same magnitude with this common writer and forced rebuild, but the experiment changes the writer
as well as build provenance relative to the initial capture. It does not prove stale output caused
the earlier HTTP result.

There are zero request errors. At 6,000 offered RPS, marked / markerless / React have 4 / 8 / 6
missed admissions out of 120,000 offered requests per variant across both populations. Missed
admissions are retained separately and are not counted as successful requests.

The working framework retains markerless text-run adoption and the common optimized writer.
The isolated rendering and payload gains are supported; matching React's HTTP throughput remains
unresolved. Public aggregate benchmark charts are unchanged.

The [raw results and build audit](ssr-fresh-build-2026-09-08.json) retain artifact hashes,
changed server lines, renderer samples, both HTTP populations, and request accounting.
The [evidence archive](ssr-fresh-build-2026-09-08-evidence.zip) retains source, paired application
artifacts, runner scripts, inputs, and a SHA-256 inventory.
