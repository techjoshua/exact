# Empty child-result reuse, September 10, 2026

Status: integrated and correctness-validated for its measured allocation reduction. Timing results are mixed, especially on Bun under active workstation use. No fresh HTTP throughput claim is made, and the overall React comparison goal remains unmet.

## Change

Native components write into the shared sink, but child traversal still constructed an object containing empty HTML and a non-text flag for their completed output. Traversal now reuses one frozen, request-independent result for empty structural output and absent/boolean children. Nonempty results and empty scalar strings retain their ordinary classification. Internal result types are readonly. The shared object contains no component state, owner or cleanup resource.

Hypothesis: removing repeated short-lived result objects could reduce allocation and traversal cost without changing compiler programs, sink APIs, node accounting, text separation, suspension or lifecycle handling. Source changes stay in the child-traversal module. Engineering documentation explains the invariant. Public application behavior is unchanged, so public usage documentation and package READMEs do not require changes.

## Measurements

Fresh production processes use the previous completed-HTML build as control, with 50,000 warmups and two reversed orders. All complete document hashes match, including application-owned shells and four asset tags. The workstation was in active use throughout.

Node allocation sampling measures 10,000 renders at a 16 KiB interval and includes minor-collected and major-collected objects. Mean estimated allocated bytes per render:

| Fixture      | Previous | Candidate | Reduction |
| ------------ | -------: | --------: | --------: |
| 3 incidents  |   73,198 |    71,717 |      2.0% |
| 96 incidents |  544,671 |   539,968 |      0.9% |

Both pairs improve for each fixture. These are sampled JavaScript heap allocations, not exact object counts, retained memory or total native memory. No GC event reduction is claimed from these measurements.

Response-consumption screens measure 20,000 iterations after warmup. Each iteration renders the full string, constructs a Response and awaits its text consumption. These are not HTTP capacity measurements. Mean microseconds per iteration:

| Runtime          | Fixture      | Previous | Candidate |
| ---------------- | ------------ | -------: | --------: |
| Node             | 3 incidents  |    42.83 |     42.02 |
| Bun              | 3 incidents  |    35.15 |     34.38 |
| Node             | 96 incidents |   203.48 |    197.01 |
| Bun              | 96 incidents |   250.38 |    264.55 |
| Bun confirmation | 96 incidents |   238.62 |    232.05 |

Small Node directions are mixed; both small Bun pairs improve. Both large Node pairs improve. Initial large Bun pairs are 272.12 to 267.90 and 228.65 to 261.19, including a substantial second-pair regression. The focused confirmation is 230.76 to 234.15 and 246.48 to 229.94, also mixed. All observations remain evidence. The confirmation does not erase the regression; together they do not establish a stable large-Bun timing effect. The small implementation is retained for lower measured allocation volume and preserved behavior, not a claimed universal speedup.

## Validation

Three focused tests protect cross-render mutation isolation and the distinction between empty scalar text and absent children with shared and captured output. All 355 SSR tests in 56 files pass. Test typechecking, the SSR package build, targeted ESLint/formatting, source architecture and JSDoc checks pass. Both server applications and the comparison client rebuilt. All 56 browser checks across Node/Bun string/stream pass, covering both frameworks.

The integrated candidate is additionally compared with the preceding frozen build under a promise from every third ready call on both StringProgramSink and CapturedProgramSink. Three requests with distinct input titles run concurrently for each fixture size and mode in both runtimes. All 24 complete-output comparisons pass. Per runtime, these groups induce 183/105 small string/stream suspensions and 1,113/663 large string/stream suspensions. This focused stress probe supplements rather than replaces the package and browser coverage.

No compiler helper signatures or artifact semantics change, and frozen ABI fixtures are not regenerated. The preceding control is `9093d5a3f3fdc1df26aa016be083964eace4f50ddb87766312e813331dd235b3`.

Package-content and release-ABI checks also pass; the release check retains the initial epoch-1 baseline at 0.5.0.

Integrated Node artifact: `1712c0d2d246c15c1cc95c638c76ffe4be66f6e482bb34640b345c7ef0e6f4a7`.

Integrated Bun artifact: `21355cf4dee306bea319c3160b4110466b0818749fc12ff9e48945b7f7694498`.

Evidence: `empty-child-result-2026-09-10-evidence.zip` contains the frozen control, prototype and integrated artifacts, construction/measurement scripts, allocation profiles, all timing populations, source snapshots, browser logs and suspension results.
