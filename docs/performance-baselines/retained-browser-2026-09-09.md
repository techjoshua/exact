# Retained build browser timings, September 9, 2026

The current eXact build has lower median page-load times than React in this focused capture.
React has lower claim-interaction latency and post-interaction retained heap. This is not a full
benchmark replacement or evidence that the remaining SSR throughput gaps have been resolved.

## Scope and method

Production Node 26.8.1, current streaming artifacts, full application-owned documents and actual
client assets. Both participants use the same Node HTTP stream consumer. This isolates browser
behavior from adapter differences; it does not measure the Bun adapter or eXact's Node response
adapter. Rendering runs on every navigation, with no artificial hydration delay or HTML replay.

Each framework has 20 measured samples per profile, in alternating order, using fresh Chromium
contexts with the cache disabled. The browser process is warm. Local and constrained profiles run
separately. The constrained profile requests 4x CPU throttling, 40 ms latency, and 10 Mbps in each
direction through CDP. These are simulated conditions, not measurements of a physical mobile device.

Every sample checks live-service readiness, claims an incident, and verifies the authoritative
owner/version update. Browser errors, request failures, server errors, and mismatched semantic
response hashes fail the run. All 80 measured samples pass. Whole response hashes and asset hashes
are recorded, and artifacts/assets match between the local and constrained captures.

The first run finished all local measurements, then failed a harness assertion during the next
profile's warmup: it expected an empty accumulated result set. The assertion was corrected, the
local results preserved, and the constrained profile completed separately. No application change
was needed. The failed log and corrected runner are retained in the archive.

## Results

Medians in milliseconds, lower is better. Page load is the Navigation Timing duration, not a
client-side route-change measurement. Service readiness is a separate application-visible milestone.
Paint timing has browser frame granularity, so small differences should not be overinterpreted.

| Profile     | Framework | Page load | First paint | Service ready | Optimistic feedback | Settlement |
| ----------- | --------- | --------: | ----------: | ------------: | ------------------: | ---------: |
| local       | exact     |     31.80 |       44.00 |         56.50 |                2.10 |      12.70 |
| local       | react     |     40.00 |       52.00 |         57.05 |                1.70 |      12.85 |
| constrained | exact     |    319.25 |      264.00 |        509.50 |               12.15 |      24.80 |
| constrained | react     |    370.25 |      268.00 |        515.20 |               10.45 |      21.65 |

Post-interaction, post-GC retained heap medians are approximately 2.58 MB for eXact and 2.30 MB for
React locally, and 2.57 MB versus 2.28 MB under throttling. These are point-in-time retained values,
not peak allocation or leak measurements. Collection occurs after interaction timing.

The complete document with asset tags is 4,422 bytes for eXact and 3,580 bytes for React in this
fixture. Raw script transfer measurements and resource timing entries are included in the data.

## Interpretation and remaining work

The current browser results do not show a page-load disadvantage relative to React in this fixture.
They do not prove that a prior eXact navigation regression was fixed: no earlier eXact build was run
as a paired control, and machine workload varies. They also do not isolate the benefit of early shell
publication because both framework implementation and asset costs differ.

Claim feedback and settlement remain areas to inspect, particularly under CPU throttling. Full
browser, route navigation, memory lifecycle, and runtime-specific delivery comparisons remain
separate from this focused capture. Public historical charts are not replaced by these numbers.
The current HTTP report still shows three throughput gaps, so the overall goal remains unmet.

[Raw samples](retained-browser-2026-09-09.json) and
[evidence archive](retained-browser-2026-09-09-evidence.zip) preserve the measurements, server and
client artifacts, and runner. Reproduction requires locked repository dependencies and the installed
Playwright Chromium browser. No production runtime, compiler, or application code changed.
