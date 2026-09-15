# Shared child-render callbacks, September 10, 2026

Status: diagnostic candidate rejected. Production source, compiler and canonical applications remain unchanged.

## Hypothesis and implementation

The warmed Node HTTP allocation profile attributed 3.26 kB/request to renderComponentReference. Source review found two callbacks created at each component traversal that capture request context/options and accept the child owner explicitly. The hypothesis was that sharing these callbacks could reduce temporary allocations and yield a small string-rendering improvement, especially for larger trees.

An asserted transformation of the retained compiled application adds a module-local WeakMap keyed by request context. Each entry holds the options identity and the two callbacks. A different options identity creates a new entry; callbacks already retained by pending work retain their original options. Context and owner are not shared across requests. This is an experimental bundle, not an accepted source implementation or an ABI change.

## Timing results

Sixteen fresh production processes cover Node/Bun, three-incident and 96-incident full application-owned documents, and two reversed candidate/control orders. Every process warms 50,000 renders and measures 20,000. Four asset tags and complete document boundaries are checked; candidate output hashes match the retained output. No allocation sampling runs concurrently with timing.

Mean microseconds/render, lower is better:

| Runtime | Fixture      | Retained | Candidate | Candidate change |
| ------- | ------------ | -------: | --------: | ---------------: |
| Node    | 3 incidents  |    26.75 |     27.23 |            +1.8% |
| Node    | 96 incidents |   181.14 |    183.84 |            +1.5% |
| Bun     | 3 incidents  |    31.39 |     28.16 |           -10.3% |
| Bun     | 96 incidents |   218.22 |    231.21 |            +6.0% |

The Node large-document orders disagree about the direction of change and have substantial timing variation: 172.22 versus 170.02 in the first pair, 190.07 versus 197.66 in the second. Bun large is slower in both orders; Bun small is faster in both. All observations remain in the raw capture. React was not rerun in this rejection screen, and no new React comparison is inferred.

## Allocation check

A separate Node-only renderer capture uses the same documents and four asset tags, 50,000 warmup renders, then 10,000 sampled renders. Inspector sampling uses a 16,384-byte interval and includes objects collected by minor and major GC. One process per variant/fixture makes this a diagnostic check rather than a precision estimate. It excludes HTTP request/response work.

| Fixture      | Retained estimated kB/render | Candidate estimated kB/render |
| ------------ | ---------------------------: | ----------------------------: |
| 3 incidents  |                        73.76 |                         74.01 |
| 96 incidents |                       546.22 |                        539.78 |

The large-document estimate decreases by 6.43 kB/render, approximately 1.2%. The small-document estimate does not show a reduction. These are sampled JavaScript heap allocation bytes, including collected objects, not retained memory or exact object counts. GC time was not measured in this candidate capture, so it does not prove reduced GC time.

The cache reduces estimated allocation on the larger fixture without delivering a consistent execution-time benefit. It remains out. The experiment does not reject the broader objective of removing temporary execution objects or establish a causal engine-level explanation for the timing changes. A design that avoids cache lookup and retention costs remains a distinct possible experiment.

Canonical Node SHA-256 remained `c4078f2d32648844b84e0611dd04ab5f0046cdfa119745f4074b5eb43531528b`. No production changes or frozen ABI fixture regeneration occurred. Browser/package acceptance tests were not run for the rejected bundle candidate. The overall performance objective remains unmet.

Evidence: `shared-child-callbacks-2026-09-10-evidence.zip` contains the candidate artifact, construction script, timing worker/runner/results, allocation worker/runner/results, and raw allocation profiles.
