# Shared synchronous publication callback experiment

Status: neither prototype is adopted. Sharing the callback reduces sampled Node allocation slightly, but the response-consumption screens do not establish a consistent timing benefit. Production remains the completed-HTML result build.

## Mechanism

Current synchronous artifact execution allocates a publication callback capturing its execution object, reference and parent. A per-artifact execution object already exists. The receiver prototype adds the reference and parent to that object at construction, lifts the callback into a shared function, and invokes it with call using the execution object as receiver. This is runtime publication plumbing, not the earlier component-instance-bound compiled writer experiment. The component preparation, generated program, common renderer and public sink API remain unchanged.

The explicit-argument variant passes the same existing execution object as the final callback argument instead of using call. Neither variant creates an extra wrapper for callback state. Both preserve the existing render-error rejection branch and only allocate promise publication callbacks for pending output. These are asserted bundle transformations; internal source signatures are not migrated.

Hypothesis: removing one callback and captured environment per synchronous component could reduce allocation and dispatch work, especially for 96-incident documents. Earlier profiler attribution to executeSynchronousArtifact includes inlined work and must not be interpreted as the callback's allocation size.

## Allocation

Node 26.8.1 fresh production processes, 50,000 warmups, two reversed orders, 10,000 sampled renders per population, 16 KiB inspector sampling interval, including minor-collected and major-collected objects. Complete HTML hashes match, including full shells and four asset tags.

| Fixture | Current allocated KB/render | Receiver allocated KB/render |
| --- | ---: | ---: |
| 3 incidents | 73.43 | 72.41 |
| 96 incidents | 544.70 | 540.18 |

Both pairs improve, by approximately 1.4% and 0.8% on the means. These are sampled JavaScript heap allocation estimates, not exact object counts, retained memory or native allocation. No allocation measurement is claimed for the explicit-argument variant, and no GC event measurement is claimed for either variant.

## Response consumption

Each fresh production process warms 50,000 iterations and measures 20,000. Every iteration renders the small document, constructs a Response and awaits text consumption. These are renderer plus encoding/decoding observations, not HTTP throughput. The workstation was in active use throughout.

Mean microseconds per iteration:

| Screen | Runtime | Current | Receiver | Explicit argument |
| --- | --- | ---: | ---: | ---: |
| Initial | Node | 41.27 | 42.70 | n/a |
| Initial | Bun | 33.76 | 33.16 | n/a |
| Three-way | Node | 36.78 | 37.10 | 38.49 |
| Three-way | Bun | 32.21 | 34.37 | 31.92 |

The initial Node directions are mixed; both initial Bun pairs improve. In the three-way screen, receiver Node directions are mixed and both Bun pairs are slower. Explicit-argument Node is nearly tied in one pair and slower in the other; Bun is mixed. These inconsistent results do not justify migrating the internal callback contract. The allocation reduction remains a measured fact rather than being converted into an unsupported throughput claim.

## Forced suspension

Each prototype is separately tested on Node and Bun, in string and streaming modes, with three distinct concurrent requests per fixture size. Instrumentation makes every third ready call on StringProgramSink and CapturedProgramSink return a promise. All 48 candidate/control document comparisons pass. Each runtime and variant induces 183/105 suspensions for small string/stream groups and 1,113/663 for large groups. This checks actual framework output and request separation through suspension. It is not broad lifecycle, error-cleanup, observer or package acceptance coverage, and no such validation is claimed for the unadopted prototypes.

The frozen control is `9093d5a3f3fdc1df26aa016be083964eace4f50ddb87766312e813331dd235b3`. Evidence: `publication-receiver-2026-09-10-evidence.zip` contains construction scripts, all variants, allocation profiles, timing populations and forced-suspension probes. No runtime, compiler or application source changed in this investigation.
