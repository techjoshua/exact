# Scalar prop proof experiments, September 10, 2026

Status: artifact prototypes only. WeakSet representation rejected; reference-carried proof
warrants source experimentation but is not integrated. Production remains static-input reuse.

## Hypothesis and audited scope

The prop-preparation upper bound showed 4.6% Node and 6.3% Bun large-string savings if all
preparation disappeared. These probes target only the two generated SeverityBadge call sites.
Inspection confirms each receives a fresh one-field object literal with the severity value.
The guard checks the actual value, not its TypeScript type: object/function inputs retain
ordinary dependency preparation. Hypothesis: a proof could recover some of that saving, perhaps
1-3%, provided recording and checking the proof cost less than ordinary preparation.

The first representation stores successful proofs in a WeakSet keyed by the prop bag, then
consults that set in prepareComponentProps. The second stores the proved bag on the already
allocated component reference and passes it into synchronous execution. It skips preparation
only when the current prop bag is the identical object. Neither modifies the prop bag itself.

## Method

Fresh production Node/Bun processes render the complete application-owned document with four
asset tags. Each population uses 5,000 warmups and 10,000 measured iterations; two reversed
orders compare current eXact, candidate, and React. The small fixture has three incidents,
the large fixture 96. Encoded mode consumes the string through Response.text(); stream mode
fully consumes the framework stream. Every eXact output hash matches its control. Units are
microseconds per render, lower is better. Each table has its own paired controls.

## WeakSet proof

| Runtime | Mode | Size | Current | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | small | 34.42 | 34.34 | 22.91 |
| node | string | large | 172.33 | 191.20 | 133.30 |
| node | encoded | small | 51.90 | 51.97 | 33.57 |
| node | encoded | large | 204.41 | 231.88 | 179.22 |
| bun | string | small | 36.58 | 36.83 | 32.54 |
| bun | string | large | 215.44 | 214.41 | 180.73 |
| bun | encoded | small | 39.55 | 37.85 | 38.11 |
| bun | encoded | large | 227.05 | 218.33 | 203.68 |


Large Node string and encoded times regress substantially. This representation is rejected;
its cost cannot be justified by the current target workload. No production code was changed.

## Reference-carried proof

| Runtime | Mode | Size | Current | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | small | 33.45 | 33.10 | 22.81 |
| node | string | large | 167.05 | 160.93 | 132.20 |
| node | encoded | small | 50.88 | 50.86 | 33.67 |
| node | encoded | large | 203.22 | 206.94 | 178.00 |
| node | stream | small | 55.71 | 54.85 | 66.15 |
| node | stream | large | 194.53 | 194.62 | 337.42 |
| bun | string | small | 39.01 | 36.73 | 31.53 |
| bun | string | large | 218.24 | 206.55 | 185.20 |
| bun | encoded | small | 38.95 | 37.93 | 38.28 |
| bun | encoded | large | 223.86 | 214.80 | 207.20 |
| bun | stream | small | 56.50 | 53.14 | 52.48 |
| bun | stream | large | 292.18 | 283.04 | 266.40 |


Large strings improve approximately 3.7% on Node and 5.4% on Bun. Node encoded and streaming
results are mixed; Bun results are more encouraging, but some controls vary substantially
between populations. These short measurements do not establish statistical confidence or HTTP
throughput. This is a candidate for implementation and confirmation, not an accepted win.

Eight selection checks verify primitive values receive the proof while objects, functions, and
promises do not. That is narrow prototype coverage, not full pending-task or lifecycle validation.

## Required production work

The fixture-specific helper is not a general compiler implementation. Production must prove the
complete bag is freshly constructed, has a finite known field set, and remains private until
preparation. A TypeScript scalar annotation is insufficient. Spreads, computed keys, accessors,
prototype-changing fields, and unknown shapes must retain the ordinary path unless separately
proved. A copied or replaced bag must invalidate the proof. Consume the proof once so reuse,
observation, or retries cannot trust stale values after an earlier component invocation.

Any implementation must preserve deferred-task policy, pending dependency settlement, failure,
cancellation, children normalization, enhancement routing, input identity, and request isolation.
Compiler emission, runtime receipt contracts, tests, engineering documentation, ABI review, and
rebuilds must move together. The generated component continues using the same sink API and renderer.
No global preparation bypass or framework-specific benchmark application workaround is proposed.

Runners, artifacts, full captures, and selection checks are preserved in
scalar-props-proof-2026-09-10-evidence.zip. All benchmark processes completed. The overall goal
remains unmet; the latest HTTP numbers still describe the retained static-input reuse build.
