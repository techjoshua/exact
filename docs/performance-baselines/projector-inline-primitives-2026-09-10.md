# Generated primitive projector experiment, September 10, 2026

Status: rejected. Compiler source, overlay checkout, native executable, tests, and canonical application builds restored to the preceding retained implementation.

## Hypothesis and scope

Generated positional projectors called the generic validator for each schema-zero field. The candidate handles null, strings, and booleans inline, charging exactly the same node and depth budgets; numbers and containers still use the ordinary validator. Live own-property checks, field-read ordering, ancestry cleanup, and fallback sentinels remain intact. The expected gain was roughly 1-3% on large repeated records by avoiding validator calls. This is a generated-projector experiment, distinct from the older generic interpreter primitive-inline experiment. It does not remove validation or add support for non-finite numbers.

The isolated prototype changes 37 generated sites. A compiler implementation in component_positional_projection.go produced the same intended branch changes. The application bundle grew by approximately 6.9 kB uncompressed. The source diff is archived. No serialized ABI or version-one projector signature change was proposed.

## Correctness evidence

Both Node and Bun passed 714 focused projector comparisons each against the retained implementation. Cases include null/string/boolean/finite/unsupported values, generic objects and arrays, cycles, prototypes, extra fields, getters deleting later fields, thrown errors, node/depth limits, and active-ancestor cleanup. These probes use actual generated callbacks and runtime validator functions, with fresh input per variant. They are focused equivalence checks, not browser coverage.

The compiler source candidate passed native compiler and command-package Go tests, SSR test type checking, targeted ESLint, and 353 SSR tests in 55 files. Added tests compare primitive budget behavior with the interpreted schema. Rebuilt artifacts were inspected for the new branches before HTTP tests. Browser and package/ABI acceptance were not run because performance did not justify retaining the candidate.

## Focused renderer results

All processes use production mode and 5,000 warmup renders. Complete document boundaries, assets, and final eXact output hashes are checked. Each table reports mean microseconds per render, lower is better. String returns the whole document; encoded constructs a Response and consumes its text; stream consumes the complete stream. Small means three incidents; large means 96 incidents. These are not HTTP rates.

### Initial large prototype, 10,000 renders, two reversed orders

| Runtime | Mode    | Document | Retained | Candidate |  React |
| ------- | ------- | -------- | -------: | --------: | -----: |
| node    | string  | large    |   158.28 |    155.37 | 128.38 |
| node    | encoded | large    |   192.48 |    193.01 | 179.11 |
| node    | stream  | large    |   186.10 |    184.33 | 333.94 |
| bun     | string  | large    |   205.93 |    207.52 | 184.28 |
| bun     | encoded | large    |   215.57 |    211.56 | 203.20 |
| bun     | stream  | large    |   289.88 |    285.87 | 264.60 |

### Large confirmation, 20,000 renders, two reversed orders

| Runtime | Mode   | Document | Retained | Candidate |  React |
| ------- | ------ | -------- | -------: | --------: | -----: |
| node    | string | large    |   162.94 |    160.83 | 130.82 |
| node    | stream | large    |   190.37 |    187.56 | 332.46 |
| bun     | string | large    |   213.52 |    211.97 | 194.39 |
| bun     | stream | large    |   283.43 |    286.82 | 277.76 |

### Rebuilt-source small check, 10,000 renders, two reversed orders

| Runtime | Mode   | Document | Retained | Candidate | React |
| ------- | ------ | -------- | -------: | --------: | ----: |
| node    | string | assets   |    33.32 |     33.03 | 22.93 |
| node    | stream | assets   |    55.38 |     53.86 | 67.12 |
| bun     | string | assets   |    37.48 |     38.04 | 32.42 |
| bun     | stream | assets   |    54.26 |     55.38 | 52.94 |

### Bun small confirmation, 20,000 renders, four alternating orders

| Runtime | Mode   | Document | Retained | Candidate | React |
| ------- | ------ | -------- | -------: | --------: | ----: |
| bun     | string | assets   |    32.90 |     34.38 | 33.40 |
| bun     | stream | assets   |    50.54 |     50.25 | 53.81 |

## Large-document HTTP comparison

The standard small HTTP fixture would not activate the length-at-least-16 projector path. A copied worker expands preloaded data to 96 incidents identically for eXact and React before timed rendering. Both render their complete application-owned shell. Two drivers each use 16 concurrent requests, 2 seconds warmup, and 4 seconds measurement. Two reversed orders cover Node/Bun string/stream, 24 populations total. All responses are identity-checked and all populations have zero response errors. These rates must not be compared directly with the standard three-incident HTTP results.

| Runtime | Mode   | Retained requests/s | Candidate requests/s | React requests/s |
| ------- | ------ | ------------------: | -------------------: | ---------------: |
| node    | string |              2662.6 |               2641.5 |           3180.6 |
| node    | stream |              2524.2 |               2521.9 |           1376.4 |
| bun     | string |              2580.3 |               2611.5 |           2803.9 |
| bun     | stream |              2212.5 |               2234.0 |           1956.9 |

## Decision and restoration

Follow-up: the [warmup and inactive-projector audit](ssr-warmup-audit-2026-09-10.md) confirms
that the small workload makes zero projector calls. Identical-code controls also vary, and longer
warmups change the comparison. The earlier small-string slowdown remains an observed result,
but should not be treated as a demonstrated causal regression from the inline checks. The candidate
remains unadopted; reconsideration requires active-path evidence with verified warmup.

The subsequent [large-document recheck](projector-long-warmup-2026-09-10.md) uses 50,000 warmups
and the path that executes the projectors. String rendering is flat, Node encoded responses are
slower, and Bun encoded responses are faster. The candidate remains unadopted based on that
runtime tradeoff, independently of the earlier uncertain small-document result.

The Node large-render improvements repeated, and Bun large HTTP results improved in both orders. However, Bun small strings were slower in every one of the four confirmation populations. Small arrays do not activate these projectors. The inspected generated diff contains only the intended projector branches, so no unrelated generated change explains the result. This observation does not establish whether code layout, runtime optimization, or workstation variation caused the small-document difference. It does mean a broad performance improvement was not established. The added generated code and mixed outcomes do not justify adopting this version.

The compiler source and its overlay checkout, test file, native executable/build stamp, and both canonical applications were restored. Saved retained application hashes and source/test hashes were verified after rebuilding. No task-owned benchmark process remained. Frozen ABI fixtures were not regenerated. The goal of beating React across all comparable workloads remains unmet.

Evidence archive: `projector-inline-primitives-2026-09-10-evidence.zip`, SHA-256 `56ee79ed3536daa5faf008dd36caa524e804d14f32a3f09f464d478b8f082622`. Includes prototype and source builders, native source before/candidate, tests, frozen artifacts, raw measurements, focused checks, and validation/restoration logs.
