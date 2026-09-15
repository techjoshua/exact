# Source attribution for HTTP optimization activity

Status: diagnostic only. Framework, compiler, adapters, and production bundles
remain unchanged. The conditional-fragment prototype is still paused.

## Question and method

The preceding JIT-context capture recorded many unnamed optimization completions
for Exact after a tight render loop, despite no bailout in the final HTTP block.
This follow-up maps those events to source rather than proposing another code
change based on anonymous-function counts.

The same current-worker sequence runs once per framework: ten seconds of HTTP
warmup, five seconds of HTTP load, five loops of 10,000 full renders inside the
worker, then five seconds of HTTP load. Exact runs before React. Processes use
Node 26.8.1 production mode, below-normal priority, and the same full application
documents as the prior diagnostic. Only one workload runs at a time.

The worker adds V8 code/function-event logging to a framework-specific file and
enables optimization tracing after readiness. No CPU sampler is enabled. The
owner captures stdout/stderr and phase labels. Logging changes runtime behavior;
this capture is for source attribution, not an effect size or benchmark score.
It contains 179,005 valid measured HTTP responses with zero response errors.

The analyzer correlates each compilation trace's SharedFunctionInfo address with
V8 code-creation records. The textual trace uses a tagged address while the code
log uses its untagged address, so the low tag bit is normalized. Code records
supply script URL, line, and column. Bundle region labels then identify source
modules, and the corresponding generated source line is retained for inspection.
All final HTTP compilation records in both frameworks map to source.

One warmup compilation line is interrupted in the raw trace and lacks a complete
address. It remains explicitly unmapped rather than silently disappearing. Phase
boundaries are owner-written labels and can include queued trace output or
background compilation completed across a transition.

## Where the activity originates

Compilation-completion records in the final HTTP phase:

| Owner                                     | Exact records |
| ----------------------------------------- | ------------: |
| Direct component execution callbacks      |            44 |
| Document asset extraction/map callbacks   |            24 |
| Structural receipt callbacks              |            14 |
| Synchronous artifact publication callback |             8 |
| Operation target callbacks                |             7 |
| Program boundary callbacks                |             4 |
| Program writer callback                   |             4 |
| Render output callback                    |             4 |
| Tree output callback                      |             4 |
| Node internals and diagnostic worker      |            19 |
| Total                                     |           132 |

React has 31 final-phase records, including application list callbacks, document
asset callbacks, React renderer code, Node internals, and the diagnostic worker.
These are compilation-completion records, not the previous capture's narrower
optimization-completion count. They also come from a separate instrumented run;
132/31 must not be presented as a change from the previous 87/9.

The mapped Exact sites primarily wrap request-specific execution, ownership,
publication, and cleanup. They are not primarily the already-hoisted generated
render-program functions. For example, direct-component callbacks surround
`inComponentDomain`, `renderIssuedServerComponentChildren`, and publication of
the issued content. Structural callbacks surround range invocation and cleanup.

Several identical source locations compile repeatedly. The callback at generated
line 4277, column 80 compiles four times in this phase; publication at line 4461,
column 106 has eight records. Some records repeat the same function address and
SharedFunctionInfo while others have a different function address at the same
source location. These observations establish repeated compilation of mapped
sites, not its cause. They do not establish repeated bailout, code-cache eviction,
context specialization, or GC invalidation.

## How much does this explain?

V8 reports approximately 138.93 milliseconds across the three reported compile
timing fields for Exact's final phase, versus 39.45 milliseconds for React.
Those sums are not main-thread blocking time or process CPU: background work can
overlap and phase labels are approximate. The figures do not account for the
entire HTTP render-time difference. Callback dispatch and allocation may have
additional costs, but this diagnostic does not quantify them.

The earlier conclusion must remain narrow: absence of logged bailouts argues
against a bailout storm, but does not establish that optimized code is stable or
that JIT activity is irrelevant. The source mapping provides a concrete reason
to inspect request-local callback creation and code reuse instead of guessing
that the unnamed activity belonged to Node alone.

## Implication for the proposed cached root program

The compiler already shares generated writer functions. Caching another copy of
those instructions does not remove these request-local callbacks. A useful
execution redesign would need to make more of the surrounding execution and
cleanup operations reusable while preserving distinct request/component state.
That aligns with request-owned execution records invoking shared functions, but
it is not evidence that a particular record layout or `.call()` spelling is fast.

Some work in this direction is already retained: the direct-execution target
reuses child rendering and sibling preparation methods. Prior publication-receiver,
ready-props, direct-child-boundary, and shared-callback experiments also exist.
Their results must be reviewed before changing the same sites again. A broader
change needs to remove meaningful lifetime/dispatch work without replacing it
with comparable record allocation or dynamic access overhead.

The next unresolved mechanism is why these particular callbacks repeatedly
compile while HTTP execution remains slower after the internal loop. This report
does not authorize a numerical claim that callback elimination closes the gap.
The frame and three-program fusion prototypes remain unintegrated. The full
Node/Bun string/stream performance objective is not achieved.

## Evidence

`http-jit-origins-2026-09-10-evidence.zip` includes the owner and diagnostic worker,
V8 code logs, textual JIT logs, source mappings with exact source lines, raw HTTP
and loop results, current bundles, relevant runtime sources, and a verified SHA-256
manifest. All owned workers, services, and load drivers exited. No package or
browser validation is claimed for this source-attribution diagnostic.
