# SSR task dependency evidence

Date: 2026-09-09. Compiler characterization, with no production implementation change.

The shared SSR writer needs to postpone dependent expressions while emitting independent document
regions. The hypothesis is that the existing compiler effect graph can supply much of that proof,
avoiding a second dependency analyzer and avoiding task checks on every output fragment. This study
tests the available facts, not throughput, correctness of a finished span planner, or browser latency.

Thirteen synthetic application-owned document components were compiled with the current native
compiler. Each has an explicitly blocking server task with a suspension before its work. Twelve
compile without diagnostics. The dynamic computed write receives the existing EXACT2001 diagnostic.
Thirty-eight characterization checks pass. Complete requests, responses, checks, and the compiler
binary SHA-256 are in the accompanying JSON and evidence archive.

| Case                 | Observed compiler fact                                                     | Consequence for SSR dependency planning                                   |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Nested sibling       | Write `page.body`; head reads `page.title`.                                | Exact sibling paths can remain independent.                               |
| Ancestor replacement | Write `page`; head reads `page.title`.                                     | Matching must include ancestor writes.                                    |
| Whole-object read    | Write `page.title`; head passes `page` to JSON serialization.              | Matching must include descendant writes.                                  |
| Dynamic write        | Broad `page.*` write, rejected with EXACT2001.                             | Do not treat this rejected source as a supported runtime case.            |
| Dynamic read         | Accepted broad `page.*` read.                                              | Wildcard reads must intersect concrete descendant writes.                 |
| Write alias          | Task-local alias write resolves to `page.title`.                           | Existing alias analysis supplies the write path.                          |
| Read alias           | Head alias read resolves to `page.title`.                                  | Existing alias analysis supplies the read path.                           |
| Helper chain         | `title()` inherits `page.title` through `readTitle()`.                     | Reuse resolved callable effects instead of scanning head syntax alone.    |
| Helper write         | Task inherits `page.title` write from `setTitle()`.                        | Reuse task effects propagated through local calls.                        |
| Helper parameter     | Passing `page` to a local helper retains a `page` read.                    | A parent dependency is sufficient, even without precise field refinement. |
| Conditional output   | Reads include the controlling `visible` path.                              | Task dependency includes output structure, not just displayed text.       |
| Unresolved reader    | Passing `page` to an unresolved import retains a `page` read.              | Argument dependencies must survive opaque calls.                          |
| Unresolved writer    | Task passes `page` to an unresolved import but lists zero detected writes. | An empty write list does not prove absence of effects.                    |

The unresolved imports are deliberately synthetic. They were not linked or executed. This is not
evidence that an existing supported application produced stale HTML; it demonstrates insufficient
negative evidence for a new optimization. Current component-wide waiting was not changed.

## Implementation decisions informed by this audit

Do not reuse `statePathsAffectEachOther` unchanged for SSR task selection. It handles exact
ancestor/descendant paths but compares wildcard segments literally. `policyPathsOverlap` also does
not establish general nested-wildcard overlap. The new planner needs explicit handling of broad and
unknown effects, including unknown receivers, with tests at the planner boundary.

Do not interpret `reevaluationSafe` as a task-independence flag. It is false throughout these captured
callable summaries, including ordinary direct render reads. Likewise, `resolved: false` appears for
framework task policy methods and `Promise.resolve`, as well as the deliberately opaque imports.
A blanket unresolved-call fallback would unnecessarily disable useful cases. Effect completeness
must use compiler-owned semantic knowledge, resolved symbols, and argument/receiver escape facts,
not callee spelling or the absence of detected writes.

The compiler already retains callable summaries indexed by AST node and symbol, plus the original
call expressions. Use those internal facts when connecting a render region to transitive reads.
Do not parse opaque callable IDs or introduce a runtime interpreter for compiler effect tables.

Keep uncertainty scoped to the work it can affect. Proven literal output can still be independent;
an uncertain task's effects must not permit a potentially dependent dynamic expression to be
published early. The eventual plan also needs enclosing attribute/structure dependencies, context
effects, task generations, and deferred expression evaluation. Those capabilities were not tested
by this state-focused study.

## Status and limits

No compiler output format, renderer, sink, or public API was changed. No new throughput or React
comparison is claimed. The selected-task readiness foundation remains unused by production SSR;
compiler span emission and a shared traversal that flushes the head before pending body work remain
unfinished. Earlier string batching experiments do not measure that architecture.

The archive contains the executable audit script and complete evidence. Run the script from the
repository root after building the native compiler. It uses a child process with closed stdin and
waits for exit, leaving no development server running. Package and browser suites were not rerun
for this diagnostic-only change.
