# Direct component content wrapper experiment, September 10, 2026

Status: rejected isolated artifact experiment. Production source and canonical apps remain unchanged.

Hypothesis: the intermediate `{ program }` object for each direct component can be removed by carrying the already branded prepared program directly, with normalized child arrays as the alternative. This eliminates one short-lived wrapper per direct result while retaining the shared writer, component issuance, scheduling, hydration and cleanup calls. Expected benefit was small, roughly 1-3% on component-heavy trees. The prototype changes only the classification return and the two consuming expressions in a frozen bundle. It does not remove the compiler-issued invocation or its brand.

Each process uses NODE_ENV=production, 5,000 warmups, and complete application-owned documents. The first pass measures 10,000 renders per process across Node/Bun, string/encoded/stream, small/large documents and two reversed orders (72 processes). The confirmation measures 20,000 renders across Node/Bun string/encoded large documents, again in two reversed orders (24 processes). Encoded means constructing a Response from the string and consuming its text; it is not an HTTP throughput test. The worker validates document boundaries and asset presence and records the final document hash. All eXact hashes match across variants. These checks are not browser hydration or lifecycle regression coverage.

Values below are mean microseconds per render; lower is better. All populations, including outliers, are retained.

## Initial pass

| Runtime | Mode | Document | Retained | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | assets | 33.37 | 32.82 | 24.28 |
| node | string | large | 167.79 | 158.48 | 128.29 |
| node | encoded | assets | 50.61 | 49.66 | 34.53 |
| node | encoded | large | 194.70 | 197.55 | 182.60 |
| node | stream | assets | 52.60 | 52.52 | 66.26 |
| node | stream | large | 184.89 | 188.52 | 333.73 |
| bun | string | assets | 38.52 | 37.01 | 32.11 |
| bun | string | large | 209.59 | 207.41 | 182.82 |
| bun | encoded | assets | 37.83 | 37.46 | 39.79 |
| bun | encoded | large | 214.60 | 216.79 | 198.74 |
| bun | stream | assets | 53.62 | 53.07 | 51.95 |
| bun | stream | large | 284.80 | 285.53 | 289.65 |

## Longer confirmation

| Runtime | Mode | Document | Retained | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | large | 162.45 | 161.98 | 133.26 |
| node | encoded | large | 196.86 | 201.92 | 178.52 |
| bun | string | large | 215.05 | 218.59 | 197.09 |
| bun | encoded | large | 222.29 | 219.62 | 221.49 |

The initial Node large-string gain did not repeat in the longer comparison, while Node encoded output was slower in both confirmation orders. Bun did not show a repeatable large-document gain either. The first Bun large-stream React populations differ substantially (318.22 and 261.08 microseconds); their average should not be treated as stable evidence of streaming parity. No production optimization is adopted from this experiment. The shared renderer still has unresolved string-performance gaps relative to React.

Because the candidate is rejected, no source migration, ABI change, browser acceptance, or package validation is claimed. Further work should target a measured cost beyond this content wrapper rather than assume that fewer source-level allocations imply faster execution.

Evidence archive: `direct-content-unwrapped-2026-09-10-evidence.zip`. SHA-256: `93e93d62f32f34a9add35aff68f082c9bd70408fbe36623c613405ccaacdd78d`. It includes both artifacts, React comparison artifact, input data, exact patch generator, workers, raw results, and current source.
