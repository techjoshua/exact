# Leaf writer-output reuse experiment, September 10, 2026

Status: isolated prototypes, not integrated. Sampled allocations decrease, but the small-document response-consumption screen does not establish a reliable cross-runtime timing improvement. The large-document follow-up below completes timing; production acceptance remains unperformed. The overall React throughput objective remains unmet.

## Hypothesis and prototype

Current program execution allocates an output facade with context, sink, traversal target, render forwarding and sibling preparation. Programs that only produce attributes and text do not use child traversal or sibling preparation. Reusing an immutable context/sink facade for those leaves may remove repeated allocations without changing their generated writer, program invocation, shared sink, host handling or continuation ownership. The anticipated opportunity was a small allocation reduction and uncertain throughput benefit.

The isolated builder examines generated writer source once at registration, requiring a whitelist of text/attribute operations and excluding output member accesses other than sink. It marks eligible descriptors in a WeakSet. Rendering reuses one frozen context/sink facade while the context retains the same writer sink. Capture mode keeps its ordinary per-invocation output. Sink changes allocate a new facade; any pending continuation retains the prior one. Non-leaves retain their original target and preparation ownership. A second variant replaces the WeakSet lookup with a descriptor flag. Neither variant changes production source.

Source-string inspection is diagnostic scaffolding, not a proposed production ABI or proof mechanism. A production design would require the compiler to establish the leaf capability and coordinated runtime/core types, tests and initial-release documentation. Generated preparation, enhancement capture, arbitrary host nesting, cancellation, failures and any unexpected output mutation require broader review than these fixture checks. The cache is request-owned and contains no cross-request component state.

## Counts and correctness

| Fixture | Program executions | Eligible leaf executions | Cached facades created |
| --- | ---: | ---: | ---: |
| small | 24 | 11 | 1 |
| large | 210 | 104 | 1 |

Each variant passes 24 complete-output comparisons with three concurrent distinct requests across small/large, Node/Bun and string/stream cases. Every third ready check injects a resolved Promise. Each runtime observes 183/105 suspensions in the small string/stream groups and 1,113/663 in the large groups. Shared facades are frozen, so these captures also reject direct facade mutation. They do not prove arbitrary cancellation or ownership behavior. No package or browser acceptance run is claimed.

## Allocation

Eight fresh Node populations use 50,000 warmups and 10,000 measured renders, 16 KiB sampling with minor/major collected objects included, below-normal priority and reversed orders. Both pairs improve for both sizes.

| Fixture | Current estimated bytes/render | WeakSet variant | Change |
| --- | ---: | ---: | ---: |
| small | 67,398 | 66,631 | -1.14% |
| large | 496,761 | 491,540 | -1.05% |

The user is using this PC. A source search during the final control allocation population accidentally produced excessive output after a PowerShell quoting error; that population is retained and disclosed. No timing population overlapped that search. The two allocation pairs agree in direction, but the totals remain sampled estimates. The flag variant has no separate allocation capture.

## Small-document response-consumption timing

Each variant has eight fresh production populations across Node/Bun with 50,000 warmups, 20,000 measured iterations, reversed order and below-normal priority. Every completed string is consumed through new Response(html).text(); complete document hashes match. These are not HTTP rates. Both runtimes load the same portable server entry.

| Variant | Runtime | Current elapsed us | Candidate elapsed us | Current CPU us | Candidate CPU us |
| --- | --- | ---: | ---: | ---: | ---: |
| WeakSet | node | 44.99 | 46.59 | 45.70 | 47.27 |
| WeakSet | bun | 36.87 | 36.79 | 41.45 | 46.10 |
| Flag | node | 42.00 | 41.71 | 42.98 | 41.40 |
| Flag | bun | 35.41 | 35.81 | 44.92 | 51.52 |

Raw timing labels split as the candidate. WeakSet elapsed directions are mixed on both runtimes. Flag Node elapsed is mixed, with lower candidate process CPU in both pairs; flag Bun elapsed and CPU are higher in both pairs. Process CPU includes all threads and remains sensitive to runtime and shared-machine conditions. Neither lower allocations nor removing the WeakSet lookup guarantees faster execution.

## Decision and evidence

Keep the current renderer. This experiment confirms repeated leaf facade allocation and its removable fraction. It does not establish a reliable speedup or justify a production capability/cache contract yet. Further work should distinguish the cost of selecting and accessing the cache from the allocation saved, or investigate eliminating the facade at the generated writer boundary. The large timing follow-up below is independent of the small-page screen and does not establish a stable speedup.

- `direct-execution-integrated` SHA-256: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
- `leaf-output` SHA-256: `48231f87535442428554a955b8afa83bbcac7866fae064385b3d7647a9cba7a7`.
- `leaf-output-flag` SHA-256: `4bcbd9b946316fc32a70891d102f9f543d07b8eba20ba58cf2dc8569ecf5fa07`.

The evidence archive preserves both builders, candidates and control, instrumentation, suspension results, allocation profiles and workers, timing populations, fixture, relevant source and this report. All owned benchmark processes exited.

## Large-document follow-up and WeakSet cost clarification

Twelve fresh processes compare current, WeakSet and descriptor-flag variants on the 96-incident fixture, with the same 50,000 warmups, 20,000 measured complete response consumptions, below-normal priority and reversed orders. No production code changed.

| Runtime | Current elapsed us | WeakSet elapsed us | Flag elapsed us | Current CPU us | WeakSet CPU us | Flag CPU us |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| node | 208.02 | 221.42 | 211.49 | 209.35 | 225.35 | 211.73 |
| bun | 256.40 | 273.62 | 242.23 | 355.88 | 333.20 | 312.50 |

| Runtime / order | Current elapsed us | WeakSet elapsed us | Flag elapsed us |
| --- | ---: | ---: | ---: |
| node / forward | 196.51 | 225.41 | 213.15 |
| node / reversed | 219.52 | 217.43 | 209.82 |
| bun / forward | 233.74 | 245.17 | 240.61 |
| bun / reversed | 279.07 | 302.07 | 243.86 |

Node elapsed directions are mixed for both prototypes. Bun WeakSet is slower in both pairs; Bun flag is slower in the first pair and faster in the reversed pair. The favorable Bun flag mean therefore does not establish a stable speedup. Substantial between-population changes remain visible and are not discarded. The present experiment supports keeping the current renderer.

The user correctly noted that WeakSets have allocation costs as well as lookup costs. The WeakSet prototype allocates a registry and backing storage during program registration, before warmup. Registry entries may also affect retained heap and GC bookkeeping. There are no request-local add calls in this prototype; it performs has calls during traversal. The allocation sampling window starts after module initialization and warmup, so its per-render totals do not measure that startup allocation. This limits attribution; it does not make WeakSet storage free or establish its exact retained cost.

The descriptor-flag variant removes the WeakSet and its membership lookups together. It still retains the diagnostic registration-time source scan, temporary strings/arrays and whitelist Set allocations. Those are shared prototype scaffolding, not a proposed production implementation. A compiler-emitted flag would avoid the registration scan as well. These timing results do not isolate lookup cost from registry storage, object shape, code layout or collector effects. No separate WeakSet retained-size or startup-allocation measurement was performed.

The original evidence archive remains unchanged. The follow-up archive preserves all twelve populations, driver/worker, compared bundles, builders and this corrected report. All owned processes exited; the active optimization goal remains unmet.
