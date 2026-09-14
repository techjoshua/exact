# eXact native compiler overlay

This directory contains eXact-owned Go packages that are copied into a pinned
native TypeScript checkout before building `exactc`. The upstream is now
`microsoft/TypeScript`; its Go module lives under `tsc/`. The local directory name
is retained for repository continuity.

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
- component emission retains one explicit visitor in `jsx_lowering.go`; focused
  sibling modules own element/render-program, partition, property, collection,
  reactivity, derived-value, task, state-write, stable-identity, and runtime
  capability-import lowering without adding handler dispatch or extra AST walks;
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

Run `node scripts/build-native-compiler.mjs --source <TypeScript checkout>`
to stage the overlay into a temporary worktree, run its Go tests, and build the
host. Add `--package` to stage the current platform npm package, or pass
`--platform` and `--arch` for one of the supported cross-compilation targets.
Set `EXACT_GO` when `go` is not on `PATH`.
Without an override, the checkout is stored at `.tmp/typescript-source`. The
existing `EXACT_TYPESCRIPT_GO_SOURCE` override still accepts a repository root,
which must match the pinned revision. Sparse checkouts retain the compiler and
tool modules without materializing the upstream test corpus. Native packages
include the upstream Apache license and `NOTICE.txt` attribution content.

After packing the host-platform package, run
`node scripts/test-native-compiler-package.mjs <directory containing the single tarball>`.
This installs and executes the packaged binary in an isolated fixture and checks its reported
protocol against `scripts/contracts/compiler-abi.json`. It requires no generated workspace
outputs and does not depend on how Go declares its generated version constants.

JavaScript plugins continue through the explicit compatibility host; native
extensions are registered statically at build time. Dynamic Go plugins are
deliberately excluded because Go's plugin ABI is toolchain- and
platform-sensitive.

## JSX incremental reuse patch

`overlay/internal/compiler/program.patch` narrowly extends the pinned upstream reuse guard.
`exact_jsx_reuse.go` accepts an unchanged implicit JSX runtime import only when its resolution mode
also matches. The cloned program owns a copied import map and fresh synthetic import nodes parented
to the new source file. The old program and its nodes remain untouched. Changed authored imports,
changed JSX runtime pragmas, helper imports, and content-mapped sibling guards still use upstream
fallback rules. New project configurations are built through the normal project lifecycle.

The build applies the patch to the verified pinned checkout and hashes it with the overlay. A failed
patch application fails the build. Regression tests check unaffected source identity, synthetic-node
ownership, changed imports, and incremental output against a fresh compilation.
