# String accumulation and completion, 2026-09-10

The retained string sink accumulates with `+=`. It counts incoming UTF-16 lengths without inspecting the accumulated characters. Completion prepends hints with concatenation and skips exact encoding when the three-bytes-per-code-unit upper bound fits the output cap. Tight caps still receive exact UTF-8 validation, including split and lone surrogates. The sink releases its reference after completion or failure. Engines determine rope representation and flattening; the framework does not assume every concatenation remains unmaterialized.

Hypothesis: remove a redundant flattening/encoding pass while retaining one shared renderer. The retained variant also locates hydration insertion from the document tail and copies preceding chunk references with slice instead of calculating a global offset and copying every chunk in JavaScript.

A separate isolated property variant branches at eight existing shared visitor write sites on StringProgramSink, preserves closed-state and byte-limit checks, and directly increments its string field. Other sinks still use write(). This tests current runtime dispatch, not a new compiler-emitted mode branch or a separate rendering engine. The branch is not retained in source: results differ across engines and do not establish a general improvement.

Production Node 26.8.1, Bun 1.4.2, React 19.2.0. Each cell averages two fresh processes in reversed order, with 5,000 warmups and 12,000 measured renders per process. All documents are fully app-owned and include four asset tags. Streams are fully consumed. These are in-process timings, not HTTP throughput. Small documents have three incidents and large documents 96. eXact complete-document hashes match across all variants.

| Runtime | Mode   | Document | Array/join (µs) | += method (µs) | += property branch (µs) | React (µs) |
| ------- | ------ | -------- | --------------: | -------------: | ----------------------: | ---------: |
| node    | string | assets   |           36.74 |          35.95 |                   36.51 |      22.31 |
| node    | string | large    |          171.03 |         166.89 |                  170.03 |     132.48 |
| node    | stream | assets   |           55.56 |          55.82 |                   55.12 |      67.82 |
| node    | stream | large    |          199.73 |         197.13 |                  195.85 |     340.70 |
| bun     | string | assets   |           35.76 |          36.52 |                   35.53 |      32.65 |
| bun     | string | large    |          224.68 |         233.28 |                  225.87 |     186.45 |
| bun     | stream | assets   |           51.11 |          50.21 |                   52.00 |      53.04 |
| bun     | stream | large    |          284.85 |         279.84 |                  279.90 |     270.52 |

The requested += policy is retained. Node large-string time improved, but Bun large-string time regressed in these pairs. No universal win or reduced GC has been proven. The property branch did not beat method calls on Node strings; its Bun advantage over the method variant did not establish an advantage over the original array/join control. Small differences on the shared workstation require caution.

Before these experiments, sampled profiles of the array/join build attributed 7.2% of Node and 8.9% of Bun self time to string-sink finish. Node sampled 9.4% GC for eXact versus 3.0% for React. Profiles include process startup and warmups and carry profiling overhead; percentages are diagnostic, not unprofiled throughput or allocation counts. Raw profiles are archived.

A rejected intermediate variant returned unjoined chunks from the sink. Its first experiment made Node large strings substantially slower (168.80 to 222.53 µs); downstream hydration insertion walked and copied the full chunk array. A refined tail-insertion artifact was built and tested, but not timed before the user requested +=. The retained source uses +=, not that intermediate chunk-transfer policy.

Validation: 320 SSR tests passed, package build, repository test typecheck, focused ESLint, source architecture, platform boundaries, and package contents passed. The property and method variants additionally passed 40 byte-limit cases and pressure fallbacks on each runtime. Coverage includes three-byte code units, split/lone surrogates, hints, cleanup ownership, and HTML/hydration equivalence. No browser or HTTP benchmark was rerun for this internal experiment. Overall React parity, native writer ABI migration, and progressive public tree-to-transport integration remain unfinished.
