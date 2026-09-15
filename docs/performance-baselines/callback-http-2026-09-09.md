# Retained callback build HTTP comparison

Date: 2026-09-09. The React parity objective remains unmet.

The retained eXact build leads Node streaming. React leads Node and Bun strings. Bun streaming is
close, with one population favoring each framework; this capture does not establish a reliable
lead for either there.

## Artifact and method verification

The actual Node eXact participant artifact matches callback-current.mjs byte for byte, SHA-256
8f2b511cb49b9a5b6be45587e538ef6c5fffead9ffdd336e95bdeb6c897380b6. Bun uses its runtime-specific
artifact, whose retained scalar-root, document-tail, and synchronous callback code was inspected.
Each measured artifact's hash is recorded and verified again when producing this report.
No diagnostic or rejected experiment bundle is selected.

Node 26.8.1 and Bun 1.4.2, React 19.2.0. The worker explicitly sets NODE_ENV=production. This uses
the real Node HTTP and Bun Fetch response adapters, rather than the common renderer consumer used
in recent isolated experiments. Both frameworks render complete application-owned documents on
each request. Controlled service data is preloaded, with three incidents and empty client asset
tags, so repeated service-fetch latency and client loading are outside this measurement.

Two reversed-order populations per runtime/output mode, 16 populations total. Each population
uses two independent load drivers at concurrency 16 each, 32 aggregate. Warmup lasts two seconds,
measurement four seconds. Reported throughput counts valid responses over the combined driver
measurement interval. Initial responses must be successful complete documents. Every measured
response is checked against that population's full-body byte count and SHA-256 identity.

All 490,873 measured responses were valid; measured errors: 0.

| Runtime | Output | eXact requests/s | React requests/s | eXact relative throughput |
| ------- | ------ | ---------------: | ---------------: | ------------------------: |
| node    | string |            7,634 |            9,860 |                    -22.6% |
| node    | stream |            6,664 |            4,109 |                    +62.2% |
| bun     | string |            9,179 |            9,775 |                     -6.1% |
| bun     | stream |            6,979 |            7,080 |                     -1.4% |

These are medians of two short populations on a shared workstation, not confidence intervals.
The absolute rates differ substantially from the earlier retained HTTP capture. There is no old
eXact build control in this run, so neither absolute changes nor changes in ratios across captures
can be attributed solely to the accepted optimizations. Compare frameworks within this capture.

## Consequences

Node string throughput remains the clearest gap in this workload. The Bun string deficit is
smaller, while Bun streaming is close enough that further claims require stronger paired evidence.
The large-document diagnostics remain separate: this small-document HTTP result cannot establish
large-document parity or eliminate the need to optimize hydration projection.

No production code changed. No new browser timing or correctness run is claimed here. Public full
benchmark charts retain their historical baseline: this focused HTTP run does not replace client,
navigation, interaction, memory, service-backed, or large-document measurements. All task-owned
service, worker, and driver processes were closed, and a subsequent process inventory found only
the unrelated Codex CLI Node process.

The JSON contains raw populations and driver results. The accompanying evidence archive preserves
the runner, current participant artifacts, benchmark support scripts, and SHA-256 manifest.
Reproduction requires the locked workspace dependencies.
