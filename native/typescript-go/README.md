# eXact native compiler overlay

This directory contains eXact-owned Go packages that are copied into a pinned
TypeScript-Go checkout before building `exactc-native`.

TypeScript-Go intentionally keeps its AST, checker, transformer, and printer
packages under Go's `internal` visibility rule. The overlay therefore has to be
built inside the upstream module. It is kept separate from the upstream source
so eXact can review and rebase its compiler changes without vendoring the
TypeScript test corpus or obscuring Microsoft's history.

The overlay implements the production compiler host:

- one process can serve any number of newline-delimited compilation requests;
- configured TypeScript-Go programs, checker state, source analysis, callable
  and component graphs, and their incremental caches remain in that process;
- eXact analysis, placement, policy, artifact partitioning, JSX and task
  lowering, generated validation, and statically linked extensions run against
  the native AST;
- component initialization placement excludes owned task bodies, while client task and
  server continuation requirements still select dual artifacts and public
  resumption contracts;
- files with an explicit foreign `@jsxImportSource` remain in their TypeScript
  project and native corpus but pass through without eXact component analysis
  or lowering;
- the native printer produces TypeScript 6-compatible source; and
- only source, diagnostics, artifacts, narrow build products, explanations, source maps,
  and timing summaries cross the process boundary.

The `--corpus` mode accepts one pre-discovered project/source set and runs the
complete workload inside Go. It owns concurrency, file reads, persistent
sessions, compilation, validation, and timing aggregation so the release
performance gate measures the native architecture rather than per-file
JavaScript orchestration.

Run `node scripts/build-native-compiler.mjs --source <typescript-go checkout>`
to stage the overlay into a temporary worktree, run its Go tests, and build the
host. Add `--package` to stage the current platform npm package, or pass
`--platform` and `--arch` for one of the supported cross-compilation targets.
Set `EXACT_GO` when `go` is not on `PATH`.

JavaScript plugins continue through the explicit compatibility host; native
extensions are registered statically at build time. Dynamic Go plugins are
deliberately excluded because Go's plugin ABI is toolchain- and
platform-sensitive.
