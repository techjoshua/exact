# Independent Bun admission observation, September 11, 2026

The full SSR diagnostic exposed a runtime observer-lifetime problem after the initial admission
implementation. On tested Bun 1.4.2, disabling one monitorEventLoopDelay instance stops another
instance from collecting samples. Admission idle cleanup therefore stopped the benchmark monitor.
Its next reset endpoint correctly failed with HTTP 500 because no event-loop samples arrived.

The adapter now records its own two-millisecond timer intervals into an independent createHistogram
instance. Its idle cleanup clears only its own timer. The reset-path reproduction returns HTTP 500
with the former shared observer and HTTP 200 with the independent sampler after the same workload
and idle sequence. Native regression coverage also exercises this through an actual Bun.serve host.

## Repeated same-code controls

Production Bun 1.4.2, two independent drivers, total concurrency 32, five-second warmups and
eight-second measured stages. The second population reverses automatic and disabled policy order.
Both paths independently render the same complete application and shell per request.

| Workload | API    |   Automatic RPS |  Disabled RPS | Automatic driver p99 ms | Disabled driver p99 ms |
| -------- | ------ | --------------: | ------------: | ----------------------- | ---------------------- |
| 3 rows   | string | 11,824 / 11,781 | 8,767 / 8,718 | 5.20 to 7.77            | 5.62 to 11.24          |
| 3 rows   | stream | 10,313 / 10,385 | 6,022 / 6,034 | 6.83 to 7.25            | 7.62 to 11.92          |
| 96 rows  | string |   2,512 / 2,492 | 2,566 / 2,602 | 16.02 to 23.18          | 15.05 to 15.50         |
| 96 rows  | stream |   2,291 / 2,259 | 1,981 / 1,956 | 25.70 to 26.30          | 21.70 to 23.61         |

All policy-control responses passed full-document validation without request errors. Larger string
responses still reject scheduling, with a temporary throughput and tail cost from the probes. Large
streaming gains throughput but has higher p99 in these short controls. Native drain and loop-interval
improvements do not guarantee better client p99. No React rendering or transport was changed.

The six Node capacity captures from the same session remain valid: neither their Node adapter
nor their application artifacts changed. All six Bun capacity captures and both SSR diagnostic modes
are rerun after the observer correction. The interrupted diagnostic and original Bun captures remain
in the archive as superseded investigation evidence, not current-publication inputs.

[Evidence archive](bun-observer-isolation-2026-09-11-evidence.zip) preserves the reproduction,
policy controls, previous interrupted capture, source snapshots, and validation journals.
