# Current Node string CPU profiles

Date: 2026-09-09. Diagnostic only; no production change.

## Purpose and method

The root-attribute audit found string accumulation already in use, not an attribute array that
could simply be removed. A fresh CPU profile tests whether the earlier allocation ranking also
identifies dominant execution time and directs the next renderer experiment.

Four fresh Node 26.8.1 processes cover retained eXact and React, three/96-incident string renders.
Each runs with NODE_ENV=production and --cpu-prof, using 5,000 warmups and 50,000 measured renders.
The profile includes startup and warmup; it is not scoped exclusively to the measured loop.
Each framework renders its full authored document with empty client tags. Response hashes match
the earlier corresponding control fixture. React uses its actual Node artifact. An initial missing
temporary React artifact path failed before rendering; the runner was corrected to the installed
participant artifact and resumed without repeating the successful eXact small capture.

Samples are weighted by timeDeltas and attributed to their leaf frame. Self-time percentages are
not inclusive function cost, allocation quantities, or exact microseconds per request. Generated
and inlined work can move attribution. Profiles perturb execution and are not substitutes for
paired uninstrumented throughput measurements. No HTTP sockets or browser work are measured.

## callback-current-large.cpuprofile

| Sampled leaf frame | Self time share |
| --- | ---: |
| (garbage collector) | 11.2% |
| (anonymous at line 7076) | 8.1% |
| serializeJson | 5.5% |
| (anonymous at line 0) | 5.0% |
| validatePositionalValue | 4.8% |
| renderSsrRootAttributes | 3.2% |
| appendProgramText | 2.9% |
| ssr | 2.7% |
| text | 2.1% |
| createPreparedServerComponentReference | 2.1% |

## callback-current-small.cpuprofile

| Sampled leaf frame | Self time share |
| --- | ---: |
| (garbage collector) | 11.4% |
| validatePositionalValue | 5.1% |
| serializeJson | 5.0% |
| createPreparedServerRenderProgram | 4.8% |
| createOpaqueOperation | 4.3% |
| (anonymous at line 0) | 3.9% |
| appendProgramText | 3.0% |
| createCompiledFragmentReceipt | 2.4% |
| createChunkedHydratableResult | 2.4% |
| prepareComponentProps | 1.6% |

## react-large.cpuprofile

| Sampled leaf frame | Self time share |
| --- | ---: |
| escapeTextForBrowser | 11.7% |
| Document | 9.1% |
| renderElement | 7.8% |
| retryNode | 7.5% |
| push | 5.6% |
| RegExp: ["'&<>] | 5.5% |
| pushStartInstance | 5.1% |
| renderNodeDestructive | 5.0% |
| pushAttribute | 5.0% |
| flushSegment | 4.5% |

## react-small.cpuprofile

| Sampled leaf frame | Self time share |
| --- | ---: |
| renderElement | 7.5% |
| retryNode | 7.4% |
| push | 7.1% |
| pushStartInstance | 6.6% |
| escapeTextForBrowser | 5.5% |
| Document | 5.5% |
| jsxProd | 5.0% |
| pushAttribute | 4.0% |
| pushStartGenericElement | 3.6% |
| (garbage collector) | 3.6% |

## Interpretation

Garbage collection represents approximately 11% of sampled eXact time in both sizes. The small
profile highlights prepared server programs, opaque operations, and fragment receipt creation,
alongside positional validation and JSON serialization. Large root attribute rendering has a
smaller CPU share than its earlier allocation ranking might suggest. React spends substantial
sampled time on escaping, element traversal, and output accumulation.

The next concrete target is intermediate server carrier construction, especially on the small
string workload where Node HTTP parity remains furthest away. Existing issuer scopes must remain:
an apparently leaf-only result can still construct and discard children with scheduled tasks.
The profile does not authorize removing task ownership, validation, or cleanup. Eliminating GC
entirely is not realistic, and its sampled share is not a guaranteed recoverable speedup.

The current implementation remains retained. No package/browser tests were run for this diagnostic.
The overall performance goal is unmet. The archive preserves CPU profiles, weighted summaries,
runner, worker, fixed input, framework artifacts, and hashes. React dependency execution requires
the locked workspace; its manifest versions are included.
