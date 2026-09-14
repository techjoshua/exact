# Guarded scalar props measurements, September 10, 2026

The guarded compiler/runtime candidate was measured in 72 fresh production processes: Node/Bun, string/encoded/stream, small assets/large 96-item documents, two reversed orders, and retained eXact/candidate/React. Each process warms 5,000 renders and measures 10,000. Complete eXact document hashes match. Values below are means in microseconds per render, lower is better. These are render/consume measurements, not HTTP throughput.

This capture uses private symbols. The final source subsequently uses registered symbols so separately loaded SSR copies share proof consumption and the first-attempt guard. Final-build validation and HTTP evidence must be considered separately.

| Runtime | Mode    | Document | Retained | Candidate |  React | Candidate change |
| ------- | ------- | -------- | -------: | --------: | -----: | ---------------: |
| node    | string  | assets   |    33.15 |     33.24 |  22.33 |           +0.27% |
| node    | string  | large    |   171.54 |    167.14 | 134.59 |           -2.57% |
| node    | encoded | assets   |    50.53 |     51.45 |  33.83 |           +1.81% |
| node    | encoded | large    |   205.36 |    202.27 | 178.91 |           -1.50% |
| node    | stream  | assets   |    53.00 |     53.20 |  65.35 |           +0.38% |
| node    | stream  | large    |   197.57 |    193.39 | 334.63 |           -2.12% |
| bun     | string  | assets   |    36.90 |     36.36 |  31.27 |           -1.46% |
| bun     | string  | large    |   213.78 |    208.32 | 183.99 |           -2.55% |
| bun     | encoded | assets   |    38.57 |     38.33 |  37.78 |           -0.62% |
| bun     | encoded | large    |   221.86 |    216.50 | 201.25 |           -2.42% |
| bun     | stream  | assets   |    52.46 |     54.34 |  52.07 |           +3.58% |
| bun     | stream  | large    |   303.32 |    292.40 | 274.60 |           -3.60% |

The initial small Bun stream candidate was slower in both orders. A longer confirmation used four alternating orders and 20,000 measured renders per process. Its means were 50.09 retained, 50.00 candidate, and 53.90 React microseconds. The apparent regression did not reproduce; this is evidence of an approximately neutral result, not a claimed gain. Both captures are retained.

Large-document improvements are generally modest. Node string and Bun large streaming still trail React. This experiment does not meet the overall performance objective.

## Final registered-symbol build

All 72 fresh-process measurements completed. Complete eXact output hashes match. Method and units are the same as above. The candidate is scalar-proof-shared/server-entry.js, whose registered symbols match the final emitted runtime and canonical application builds.

| Runtime | Mode    | Document | Retained | Candidate |  React | Candidate change |
| ------- | ------- | -------- | -------: | --------: | -----: | ---------------: |
| node    | string  | assets   |    33.22 |     34.50 |  22.74 |           +3.86% |
| node    | string  | large    |   169.39 |    165.63 | 131.86 |           -2.22% |
| node    | encoded | assets   |    50.62 |     50.96 |  32.81 |           +0.67% |
| node    | encoded | large    |   209.32 |    204.96 | 180.12 |           -2.08% |
| node    | stream  | assets   |    53.36 |     54.37 |  67.66 |           +1.90% |
| node    | stream  | large    |   198.73 |    192.13 | 336.57 |           -3.33% |
| bun     | string  | assets   |    38.13 |     37.20 |  31.65 |           -2.44% |
| bun     | string  | large    |   217.53 |    207.05 | 182.82 |           -4.82% |
| bun     | encoded | assets   |    38.48 |     40.25 |  38.16 |           +4.60% |
| bun     | encoded | large    |   226.41 |    216.20 | 202.96 |           -4.51% |
| bun     | stream  | assets   |    54.96 |     54.04 |  53.41 |           -1.67% |
| bun     | stream  | large    |   298.58 |    291.97 | 267.62 |           -2.21% |

## Final HTTP comparison

Two reversed orders, two drivers at concurrency 16 each, two seconds warmup and four seconds measured per process. Each response is checked against its full expected document identity. All 24 populations completed with zero errors. Means below are valid requests/s, higher is better.

| Runtime | Mode   | Previous eXact | Final candidate |  React |
| ------- | ------ | -------------: | --------------: | -----: |
| node    | string |         7147.0 |          7050.5 | 9671.8 |
| node    | stream |         6327.3 |          6255.2 | 3877.9 |
| bun     | string |         8567.9 |          8619.0 | 9071.6 |
| bun     | stream |         6492.6 |          6492.9 | 6625.9 |

HTTP results are mixed: Node string -1.35%, Node stream -1.14%, Bun string +0.60%, and Bun stream approximately unchanged. These short machine-local captures do not establish a universal HTTP improvement. eXact remains ahead on Node streaming but trails React in the other three means.

## Longer small-document confirmation and decision

The Node string and Bun encoded-string regressions in the final matrix justified four alternating orders with 20,000 measured renders after 5,000 warmups. All document hashes match.

| Runtime/mode | Retained | Candidate | React |
| ------------ | -------: | --------: | ----: |
| node string  |    30.75 |     30.64 | 22.27 |
| bun encoded  |    33.96 |     33.91 | 38.66 |

The regressions did not reproduce. The guarded optimization is retained for repeatable large-tree improvements, with small cases treated as approximately neutral and the mixed HTTP result explicitly preserved. This is not a claim of a universal gain or of beating React across workloads. No minimum gain threshold was used.

Final validation: 350 SSR/compiler tests, 56 browser checks, test typechecking, SSR TypeScript build, targeted ESLint, platform boundaries, package contents, and frozen compiled ABI verification pass. No released fixture was regenerated. The implementation and raw evidence are archived in scalar-props-guarded-2026-09-10-evidence.zip.

Evidence archive SHA-256: `8973a9cf0ae10a36c979f64a0220f4f4645661571593ff4bae3dd0f1e8c9e808`. All task-owned benchmark and validation processes have exited.
