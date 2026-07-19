# Release check performance

The release workflow uses `scripts/release-check.mjs` to run each phase once, record
its duration, and keep correctness checks separate from benchmarks. Timing reports
are written to `.tmp/release-timings-<profile>.json`.

## Profiles

| Command                     | Intended use               | Coverage                                                                                                                                                                                                           |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run release:affected`  | Pull-request feedback      | Builds once, runs static checks, and selects tests, sample builds, expression checks, and compatibility gates from the changed workspace dependency closure. Set `RELEASE_BASE` to choose the comparison revision. |
| `npm run release:quick`     | Frequent local correctness | Full package and sample tests, static checks, expression corpus, and Kanban/Workbench production builds.                                                                                                           |
| `npm run release:check`     | Required correctness gate  | Everything in `release:quick`, plus React 18/19 conformance and the Chromium/Firefox/WebKit R3F matrix.                                                                                                            |
| `npm run performance:check` | Stable performance signal  | Reactive, expression/compiler, language-service, and React compatibility benchmarks, without competing correctness work.                                                                                           |
| `npm run release:full`      | Explicit exhaustive run    | `release:check` and all performance benchmarks in one invocation.                                                                                                                                                  |

`release:check` is the normal release gate. Benchmarks are intentionally excluded
because machine load can make performance measurements noisy without changing
correctness. Use `release:full` when one command must cover both.

## Optimizations

- The root TypeScript build runs once. React and browser gates use built-entry
  scripts instead of rebuilding the monorepo.
- Independent static checks and sample builds run concurrently, while the
  CPU-heavy expression corpus and test suite run alone to avoid contention.
- Expression projects are distributed largest-first across four workers.
- Package dry-runs use four workers.
- React 18/19 conformance inputs and the three browser engines run concurrently.
- The generated R3F browser scenario bundle is content-addressed under
  `.tmp/release-cache`; source, lockfile, runtime, platform, and architecture are
  part of its cache key.

Worker counts can be tuned with `EXACT_EXPRESSION_WORKERS` and
`EXACT_PACK_WORKERS`.

## Measured result

Measured on Windows 10.0.26200 with Node v24.11.1 and an AMD Ryzen 7 8745HS:

| Run                                 | Elapsed | Change from prior release check |
| ----------------------------------- | ------: | ------------------------------: |
| Previous sequential `release:check` | 569.9 s |                               — |
| Optimized `release:quick`           | 212.4 s |               -357.5 s (-62.7%) |
| Optimized `release:check`           | 231.7 s |               -338.2 s (-59.3%) |
| Isolated `performance:check`        |  80.8 s |      separated from correctness |

The optimized correctness gate retains the prior release coverage. Its measured
critical path is now the full expression corpus (91.6 s) followed by the full
test suite (101.4 s); React compatibility adds 14.2 s and the cached browser
matrix adds 5.5 s.
