# SSR output wrapper confirmation

Date: 2026-09-09. Decision: retain current production implementation.

The [initial wrapper isolation experiment](segments-only-2026-09-09.md) showed consistent Bun
string gains in two pairs, mixed Node string results, and mixed stream results. Four additional
reversed-order pairs per runtime and mode tested whether that pattern persisted. The hypothesis
remained a small allocation-driven gain, likely under 2%, from removing only a forwarding object.

The confirmation adds 32 fresh processes to the original 16. Settings are unchanged: production
environment, 96 incidents, 5,000 warmups and 12,000 measured renders per process, complete authored
document, empty client tags, same portable bundle on Node and Bun, and Response.text() consumption
for streams. All paired full-document hashes match. Artifact hashes are recorded in every row.

## Combined results

Positive means longer rendering time. Medians summarize six within-pair percentage changes, not
pooled request counts. These are descriptive measurements on a variable-load workstation, not
confidence bounds or HTTP throughput claims.

| Runtime | Mode | Median time change | Candidate faster pairs |
| --- | --- | ---: | ---: |
| node | string | -0.88% | 5/6 |
| node | stream | +0.17% | 3/6 |
| bun | string | +0.10% | 3/6 |
| bun | stream | -0.69% | 3/6 |

All four additional Node string pairs favored the candidate, but three of four additional Bun
string pairs favored the control. Stream results remained mixed. The initial Bun string improvement
did not replicate reliably. A small forwarding object is therefore not a demonstrated solution to
the remaining cross-runtime gap. No production change was made, and no previous improvement was
removed. No package or browser validation was needed for this rejected bundle-only experiment;
fixture output equality does not establish lifecycle equivalence for a future implementation.

This closes the isolated wrapper experiment for now. Further optimization should target a larger
source of work rather than repeatedly tuning this wrapper against noisy timings. React was not
rerun, so this experiment makes no new claim about the current React gap. The overall goal remains
unmet.

The evidence archive includes both batches, both runners, builder, worker, fixed input, frozen
bundles, this reporter, and a SHA-256 manifest. The original report and archive are preserved.
