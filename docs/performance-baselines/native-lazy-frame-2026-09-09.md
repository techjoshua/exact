# Lazy SSR continuation frames

Date: 2026-09-09. Native compiler integration experiment; production selection unchanged.

Two Node CPU profiles compare the preceding target-methods prototype and the then-current native
continuation emitter on the actual 96-incident application. Profiling starts after 5,000 warmups
and covers 50,000 complete string renders. The hottest generated continuation frame accounts for
2.4% of sampled time; GC accounts for about 10% in both profiles. Profiles identify work, not exact
allocation counts. The stated pre-experiment hypothesis was a 3 to 8 microsecond reduction in large
Node string rendering by avoiding an always-created continuation closure around prepared locals.

## Implementation

The generated writer now falls through its switch in the initial invocation. A pending child or
sink drain selects a resume stage and exits the switch. Only that path reaches a block-scoped
snapshot and callback. Reentry restores the saved locals, character count, and issued sibling
references, then continues at the selected stage. Preparation and task startup do not repeat.

A first syntax-level experiment duplicated the snapshot literal at every pending branch. Native
integration instead emits one suspension postlude per program. This avoids quadratic generated
code growth for wide programs while retaining lazy frame creation. A single synchronous terminal
write keeps the previously tested direct completion and final-drain behavior. No second renderer
or synchronous compatibility engine is introduced.

Validation also found that authored Promise and undefined bindings could capture the new emitted
references. The former could skip a real child wait and produce closing tags before child output;
the latter could enter frame restoration incorrectly. The continuation now uses the runtime
operations table's promise constructor and void 0 for empty frame values. Before/after regressions
cover both bindings on Node and Bun. This protects these continuation references, not a claim
that all other compiler intrinsic references have been audited.

## Initial directional experiment

Two reversed-order pairs, fresh production-mode processes, 5,000 warmups and 12,000 measured
renders each. Microseconds per complete document, lower is better. This first candidate was an
AST-located transformation of the emitted writer; the final candidate below is emitted by Go.

| Runtime | Document | Previous emitter | Lazy-frame prototype | Change |
| ------- | -------- | ---------------: | -------------------: | -----: |
| node    | assets   |            36.44 |                35.98 |  -1.3% |
| node    | large    |           167.48 |               161.44 |  -3.6% |
| bun     | assets   |            34.38 |                34.99 |  +1.8% |
| bun     | large    |           212.08 |               208.10 |  -1.9% |

The raw initial harness labels the candidate pending; its entry path and hash identify the
lazy-frame artifact. It is distinct from the earlier rejected pending-property experiment.

## Final paired comparison

The corrected native emitter builds all 25 comparison-app programs with an isolated compiler.
Program IDs and component bindings are verified while linking these emitted functions to the
existing shared-sink prototype. Node 26.8.1 and Bun 1.4.2 each run both string and fully consumed
stream modes, with three or 96 incidents and four assets. Both frameworks render their own full
document shell and hydration/bootstrap output. React resolves React DOM 19.2.0 from its participant
directory. Each cell below averages two reversed-order samples, with 5,000 warmups and 12,000
measured renders per sample. No build or test ran concurrently with timing. All samples and exact
eXact document-hash comparisons are retained. These are renderer timings, not HTTP requests/s.

| Runtime | Mode   | Document | Current production | Previous emitter | Lazy-frame emitter |  React |
| ------- | ------ | -------- | -----------------: | ---------------: | -----------------: | -----: |
| node    | string | assets   |              35.37 |            36.65 |              36.01 |  22.15 |
| node    | string | large    |             159.38 |           168.25 |             158.66 | 131.27 |
| node    | stream | assets   |              54.82 |            57.36 |              56.46 |  66.47 |
| node    | stream | large    |             189.23 |           208.36 |             194.27 | 334.42 |
| bun     | string | assets   |              34.81 |            37.21 |              35.70 |  32.19 |
| bun     | string | large    |             228.83 |           217.51 |             202.57 | 188.92 |
| bun     | stream | assets   |              49.67 |            50.29 |              50.30 |  52.77 |
| bun     | stream | large    |             278.94 |           267.80 |             260.08 | 267.57 |

Large string gaps within that final paired run:

| Runtime | Previous excess time vs React | Final excess time vs React |
| ------- | ----------------------------: | -------------------------: |
| node    |                         28.2% |                      20.9% |
| bun     |                         15.1% |                       7.2% |

The emitter recovers the large Node string regression and improves the large Bun string result.
It still does not beat React in string rendering. Node streaming remains slower than current
production eXact even though it beats React. Bun's large streaming lead over React is modest.
Small string rendering remains a substantial gap, especially on Node.

A separate complete run preceded the intrinsic-shadowing fixes. Its frozen artifact and all 64
samples are preserved, but those figures are not relabeled as measurements of the final code.

## Validation and remaining work

Thirteen native-emitted writer cases pass on each runtime, including interleaved requests that
settle in reverse order, no rereading of prepared inputs, settled character accounting, pending
child and final drains, rejection, and unprepared input. The two shadowing regressions also pass
on each runtime. The original shadowing probe wrote child output synchronously, which masked the
Promise-shadow failure; moving the observable child write into its pending callback exposed the
ordering defect before the fix. The preserved failing results use that corrected probe.

The native-generated scheduled document remains byte-identical to production with and without
markers on both runtimes (553/747 bytes). Twelve pressure/cancellation cases cover 1-, 8-, and
8,192-byte thresholds, task startup, one outstanding transport write, cleanup, and hydration-tail
publication. Real Chromium adopts both runtimes' marked documents without replacing elements,
text nodes, or the hydration script, restarting server tasks, or losing cleanup. Forty application
budget cases and eight consumed-stream comparisons match production. Native compiler and command
tests and the source-architecture check pass. Native wide-plan tests enforce one snapshot postlude.

Production compiler selection and package runtime artifacts remain unchanged. The final compiler
emitter still needs integration into the production sink/runtime contract, including broader
enhancement and ownership coverage. The full-app streaming experiment still collects the document;
progressive publication is exercised by the separate scheduled fixture, not measured as browser
performance here. The objective of beating React across all comparable workloads is not met.
