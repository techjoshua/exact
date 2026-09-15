# Response-size contribution to the Node HTTP gap

Status: diagnostic complete. No production or benchmark-baseline change.

## Hypothesis

The current standard document is 4,672 bytes for eXact and 3,660 bytes for React.
The difference crosses 4 KiB, making transport buffering or allocation a plausible
contributor to the HTTP throughput gap. Explaining the whole recent gap would
require approximately a 20 to 25 percent React throughput decrease after padding.
This is a hypothesis about a possible size effect, not a claim that the current
Node transport has a specific 4 KiB allocation threshold.

The existing equalizeNodeResponsePayload helper changes response.end(chunk) into
body and padding writes followed by end(). That confounds payload size with write
pattern. This scratch worker instead appends a precomputed 1,012-space string to
React's completed document and still sends one response.end(responseDocument).
Both modes render the full React component tree on every request. No response or
render result is cached. The normal renderer timing excludes padding; complete
HTTP throughput includes concatenation, encoding, telemetry and transmission.

The eXact branch remains unchanged and acts as a null control when the same
diagnostic switch is toggled. This does not make the two benchmark payloads
permanently equal, shorten eXact output, change a renderer, or improve React.

## Method and checks

Four fresh production Node 26.8.1 workers start in eXact / React / React / eXact
order. Each receives ten seconds of warmup and four three-second measurement
blocks. Switch orders are on/off/off/on and off/on/on/off. Each block uses two
fresh driver processes at concurrency 16 each. Worker, drivers and service run
below normal priority. No tests, builds or profilers run during measurement.
Original invocation and bounded benchmark telemetry remain enabled in both modes.

Before each block, fetch and validate the selected response: status 200, unchanged
complete document prefix, expected length, and only ASCII spaces after the
original document. Drivers then verify the complete selected response identity.
Original eXact and React component trees, hydration payloads, shells, headers and
single-end response patterns are preserved. Artifact/worker hashes and adapter
measurements are checked again after the run.

The builder initially rejected its expected-source match because the worker used
CRLF line endings. It was corrected to normalize scratch source line endings before
matching. No benchmark worker was started by that failed build.

## Results

Arithmetic means of each worker's two blocks per mode:

| Participant / worker | Normal RPS | Padding enabled RPS | Change |
| -------------------- | ---------: | ------------------: | -----: |
| exact / 1            |      9,453 |               9,544 | +0.96% |
| exact / 2            |      9,330 |               9,715 | +4.13% |
| react / 1            |     12,627 |              12,093 | -4.23% |
| react / 2            |     12,447 |              12,275 | -1.38% |

All 525,747 measured responses are valid with zero errors, excluding warmups and
preflights. The raw capture contains all 16 blocks, per-block identities, timings,
telemetry and process metadata. All task-owned processes close after completion.

Padding produces a much smaller change than would be needed to close the gap.
The unchanged eXact control varies too, demonstrating why a small mode difference
cannot be treated as an exact causal estimate of transport cost. This capture does
not support response size as the dominant explanation for eXact's HTTP shortfall.
It also does not prove size has zero cost or identify a particular Node buffer
threshold. No correction factor should be applied to the public benchmark numbers.

Keep prioritizing measured rendering/publication and request-path work. This is
only a Node string-response diagnostic; it does not establish native Bun behavior,
streaming behavior, browser timing or the value of future output-size reductions.
The overall goal of outperforming React remains open.

The adjacent archive contains the worker and builder, run and report scripts,
capture and summary, fixture, framework artifacts, ownership helpers and this
report with a verified SHA-256 manifest. It is an evidence archive, not a complete
standalone installation of every workspace dependency.
