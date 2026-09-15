# Private server list snapshot experiment, September 10, 2026

Status: rejected after isolated renderer, source validation, and paired HTTP measurements. Source, tests, and canonical applications restored to the preceding retained implementation.

## Hypothesis and implementation

The direct server map helper snapshots its iterable and then maps that snapshot into a second array. The candidate replaces consumed snapshot entries in place. It preserves completion of iteration before callbacks, render-before-key evaluation, key coercion, list identity, and the existing shared rendering and child-issuance paths. It never writes to the application input array. The expected gain was small (roughly 1-3% on list-heavy documents) through one fewer array construction and mapping closure per list. No heap-volume reduction was measured; source-level construction counts are not allocation-profiler evidence.

Earlier lazy issuer/preparation-array and conditional result-layout experiments were reviewed and not repeated. Asset parsing was also checked: both applications parse the supplied build tags, so it was not removed from only one participant.

The bundle prototype changes only directSsrMap. The source implementation uses a private unknown[] snapshot and narrows each unconsumed element to the input type. The completed array contains only keyed children. A regression check mutates the application source array inside a callback and verifies traversal still uses the original snapshot.

## Validation

The source candidate passed the SSR TypeScript build, test type checking, targeted ESLint, and all 351 SSR tests in 55 files. Existing list tests cover iterator and callback ordering, keyed markup, and scheduled child cleanup on completion and abort. The added source-mutation test passed. Both canonical runtime applications rebuilt successfully. Browser and ABI acceptance checks were not run for this rejected candidate. No public API or compiler-emitted ABI change was proposed.

## Focused renderer measurements

Fresh production processes use 5,000 warmups and two reversed orders per runtime/mode/document combination. The prototype measures 10,000 renders per process (72 processes); the rebuilt source measures 15,000 (72 processes). Both variants match retained eXact complete-document hashes. Encoded mode constructs a Response from the string and consumes its text; streaming mode consumes the full stream. These are renderer/consumer timings, not HTTP rates. All raw populations are preserved. Means below are microseconds per render, lower is better.

### Bundle prototype

| Runtime | Mode    | Document | Retained | Candidate |  React |
| ------- | ------- | -------- | -------: | --------: | -----: |
| node    | string  | assets   |    32.81 |     32.15 |  22.05 |
| node    | string  | large    |   161.32 |    159.01 | 131.04 |
| node    | encoded | assets   |    50.99 |     51.86 |  38.81 |
| node    | encoded | large    |   196.32 |    193.82 | 180.44 |
| node    | stream  | assets   |    53.64 |     53.63 |  66.50 |
| node    | stream  | large    |   185.81 |    184.64 | 333.72 |
| bun     | string  | assets   |    39.08 |     37.27 |  32.13 |
| bun     | string  | large    |   210.61 |    205.30 | 183.63 |
| bun     | encoded | assets   |    38.93 |     38.56 |  37.54 |
| bun     | encoded | large    |   213.79 |    214.50 | 200.67 |
| bun     | stream  | assets   |    53.24 |     54.58 |  52.75 |
| bun     | stream  | large    |   290.04 |    288.33 | 266.07 |

### Rebuilt source

| Runtime | Mode    | Document | Retained | Candidate |  React |
| ------- | ------- | -------- | -------: | --------: | -----: |
| node    | string  | assets   |    31.45 |     31.27 |  22.32 |
| node    | string  | large    |   159.79 |    159.79 | 133.16 |
| node    | encoded | assets   |    49.39 |     49.53 |  33.42 |
| node    | encoded | large    |   205.80 |    196.46 | 181.73 |
| node    | stream  | assets   |    51.13 |     52.15 |  66.75 |
| node    | stream  | large    |   192.59 |    195.41 | 330.35 |
| bun     | string  | assets   |    34.89 |     34.84 |  34.14 |
| bun     | string  | large    |   212.99 |    214.22 | 192.85 |
| bun     | encoded | assets   |    36.24 |     36.41 |  38.90 |
| bun     | encoded | large    |   217.80 |    218.27 | 215.50 |
| bun     | stream  | assets   |    50.87 |     51.36 |  52.95 |
| bun     | stream  | large    |   288.94 |    287.06 | 280.08 |

## HTTP comparison

Twenty-four populations use two load-driver processes with 16 concurrent requests each, 2 seconds warmup and 4 seconds measurement, two reversed orders for Node/Bun string/stream. Both frameworks render complete application-owned documents. Each response is checked against its expected full-body identity; retained and candidate eXact markup is compared as well. All measured populations have zero response errors. Means below are valid requests per second, higher is better.

| Runtime | Mode   | Retained | Candidate |  React |
| ------- | ------ | -------: | --------: | -----: |
| node    | string |   7178.7 |    7038.1 | 9742.0 |
| node    | stream |   6152.8 |    6212.7 | 3919.8 |
| bun     | string |   8653.5 |    8599.7 | 9117.6 |
| bun     | stream |   6592.4 |    6605.8 | 6614.5 |

The initial string improvements did not repeat consistently in the rebuilt renderer. Node string HTTP throughput fell in both orders. The mixed outcomes do not justify replacing the existing implementation: reducing one private array construction did not establish an end-to-end improvement. The retained build remains the proven-reference implementation, and React parity across all workloads remains unresolved.

All task-owned benchmark processes were closed. The initial incremental restore retained stale emitted list code because copying back the source preserved its older timestamp. Hash verification caught this. A forced TypeScript rebuild followed by rebuilding both canonical applications restored byte-identical Node and Bun artifacts, and source/test hashes also match the saved retained files. The candidate source and tests remain only in the evidence archive.

Evidence: `in-place-server-list-2026-09-10-evidence.zip`, SHA-256 `3bfea74239e15bec5cae7e5d9421c90f387865a9a9cf124e0595330123249f3a`. Includes patch/build/run scripts, source before and candidate copies, fixtures, frozen artifacts, raw measurements, validation and restoration logs.
