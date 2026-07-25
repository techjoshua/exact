# Compiler workflow performance (July 2026)

Historical measurement record. The commit, machine, and commands below define
the measured baseline; this file is not a current performance guarantee.

Measured on commit `ca2d367` plus the compiler workflow changes in this
working tree.

- Node: 24.11.1
- npm: 11.6.4
- OS: Windows 10.0.26200 x64
- CPU: AMD Ryzen 7 8745HS

## Expression binding

The existing 20-update expression benchmark measured 527.5 ms before the
workflow changes. The final run of the retained `createProgram(oldProgram)`
path measured 488.8 ms. Intermediate runs ranged as high as 691.0 ms, so this
benchmark has noticeable machine variance, but it remains inside its 750 ms
release budget.

`SemanticDiagnosticsBuilderProgram` was also tested for the single-file
edit-and-bind path. It measured 1,088.1 ms for the same 20 updates. The builder
is therefore not the default transform strategy.

The initial affected-file result of roughly 595 entries was cold-start backlog,
not the impact of one edit. After draining that queue:

- An implementation-only virtual leaf edit produced one affected entry in
  approximately 5 ms.
- An existing Kanban source comment edit produced one affected entry in
  approximately 3 ms.
- A public model type change also produced only its changed source entry,
  despite a consumer acquiring a `TS2322` diagnostic.

A minimal TypeScript host correctly returned both the changed model and its
consumer for the same public-shape edit. The experimental
`programStrategy: "semantic-builder"` and `getAffectedDiagnostics()` APIs were
therefore removed rather than exposing an incomplete affected-file result.

## Dedicated language-service sidecar

The opt-in sidecar now combines a configured `LanguageService` with a semantic
builder, declaration-signature checks, and eXact's existing dependency graph.
The critical public-shape fixture returns both model and consumer and reports
the consumer's `TS2322`. An implementation-only leaf returns only that leaf.

The replacement benchmark uses 30 warm samples and retains the minimal public
TypeScript builder host as a correctness reference:

| Scenario                        |   Median |     p95 | Result                     |
| ------------------------------- | -------: | ------: | -------------------------- |
| Trivia-only implementation edit |  0.54 ms | 1.53 ms | One affected leaf          |
| Public-shape change             | 72.48 ms |       — | Model + consumer, `TS2322` |

Trivia-only edits are recognized from a TypeScript token fingerprint, so they
reuse semantic state without hiding syntax errors. Token-changing edits still
run semantic diagnostics. The warm implementation-only target of 20 ms is
therefore met with substantial margin.

On case-insensitive filesystems, canonical lowercase paths are private map
keys only. Script roots, affected-file results, and diagnostics retain the
first stable display spelling; a Windows regression covers alternate
drive-letter casing without duplicate roots or lowercase API output.

## Compiler transform validation

The compiler workflow benchmark uses two warmups and ten measured incremental
transforms. It compares the former full semantic rebind of generated code with
the new default syntax validation.

| Generated validation |   Median |      p95 | Program rebuilds | Semantic diagnostic passes |
| -------------------- | -------: | -------: | ---------------: | -------------------------: |
| Semantic             | 142.0 ms | 165.9 ms |               24 |                         24 |
| Syntax               |  42.9 ms |  47.8 ms |               12 |                          0 |

The default transform path is 0.30x the former median time, or approximately
3.31x faster in this scenario. Full baseline/generated semantic comparison
remains available with `generatedValidation: "semantic"` for release checks,
compiler validation suites, and hosts that prefer the additional check.

## Workflow changes

- Source invalidations and removals are lazy and batchable; the next semantic
  query performs one rebuild.
- Runtime module resolution shares the project's TypeScript
  `ModuleResolutionCache`. Ordinary source edits no longer discard the entire
  resolution cache; add/remove operations still do.
- Compiler dependency discovery uses `ts.preProcessFile` rather than regexes
  over converted expression nodes.
- Module-reference rewriting retains a bounded set of incremental programs
  instead of recreating its host from scratch for every call.
- Expression project and compiler-session stats expose semantic diagnostic
  pass counts for regression benchmarks.
- Vite serve, Webpack watch, and Bun watch/hot development workflows enable
  warning-only language-service diagnostics automatically. One-shot builds
  leave the sidecar disabled. `diagnostics: true` and `diagnostics: false`
  remain explicit overrides.
