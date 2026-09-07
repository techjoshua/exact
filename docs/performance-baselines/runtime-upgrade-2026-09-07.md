# Node and Bun runtime upgrade verification — September 7, 2026

Official release metadata identified Node 26.8.1 (Current), Node 24.20.0 (LTS), and Bun 1.4.2.
Versioned Windows x64 distributions were installed alongside the existing Node 24.11.1 and
Bun 1.3.5 under the user's local application-data `eXact-runtimes` directory. Node archive
SHA-256 values were checked against its release SHASUMS; Bun's archive was checked against
the official release asset digest. System defaults were not replaced.

Sources: [Node release index](https://nodejs.org/dist/index.json),
[Bun 1.4.2 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2).

## Sustained SSR comparison

This is an eXact runtime-version experiment, not a refresh of the five-framework charts.
The existing compiled application artifacts were reused. Each runtime received two fresh
worker populations with reversed version order. Two independent Node 24.11.1 driver processes
and a separate controlled-service process remained fixed throughout. Each worker had ten seconds
of discarded warmup followed by fifteen seconds each at total concurrency 16, 32, 64, and 128.
No tests, builds, or profilers ran concurrently with timed samples.

Node uses the Node HTTP adapter; Bun uses native `Bun.serve`. Artifacts match across versions
within each transport, with output identities validated on every request and artifact hashes
checked before and after the complete run. Comparisons between Node and Bun include their
different adapters and must not be attributed solely to the JavaScript engine.

Valid RPS aggregates responses over the simultaneous drivers' elapsed spans, including drain:

| Runtime          | Concurrency 16 | Concurrency 32 | Concurrency 64 | Concurrency 128 |
| ---------------- | -------------: | -------------: | -------------: | --------------: |
| Node 24.11.1     |          7,987 |          8,075 |          7,331 |           7,517 |
| Node 26.8.1      |          8,566 |          8,104 |          7,624 |           7,424 |
| Node 24.20.0 LTS |          7,131 |          6,895 |          6,409 |           6,390 |
| Bun 1.3.5        |          6,195 |          6,127 |          5,930 |           6,062 |
| Bun 1.4.2        |         11,766 |         11,847 |         11,342 |          11,588 |

All 5,678,207 completed requests, including warmup, were error-free. Bun 1.4.2 improved
aggregate throughput by 89.9–93.3% across concurrency levels; both populations supported the
gain. Node 26 improved concurrency-16 throughput by 7.2% overall, with paired population gains
of 11.1% and 3.9%. Higher-concurrency paired Node results changed direction between populations;
there is no uniform Node 26 improvement. Node 24.20.0 measured 10.7–15.0% below 24.11.1 in this
capture. The older Node baseline itself varied substantially between populations, so these
figures are workload observations on a shared workstation, not universal runtime rankings.

## Compatibility findings and fixes

The initial Node 26 full package run passed 2,000 tests, failed two, and skipped five. One
failure was a test-launch mistake: direct invocation omitted npm's environment, causing a
Windows `npm.cmd` spawn error. The packed-package test passed when rerun with the bundled
npm CLI environment. The other failure exposed Node 26's deprecation warning for
`module.register()`; the application loaded successfully, but its no-warning assertion failed.

The React compatibility registration entry now uses synchronous `module.registerHooks()` where
available and retains the asynchronous fallback on older hosts. ESM and CommonJS subprocess
tests check actual React import substitution with empty stderr on both old and new Node.
See [Node module registration](https://nodejs.org/api/module.html#moduleregisterhooksoptions).

Bun 1.4.2 initially failed the remote-exposure CSS assertion while Bun 1.3.5 passed it.
Preserving and inspecting both builds revealed a framework defect: generated virtual entry
specifiers contained a colon, producing NTFS alternate data streams rather than ordinary
deployable JS/CSS files. Bun 1.3.5 also emitted an ordinary CSS chunk, which let the earlier
test overlook the invalid entry files. This was not evidence that old Bun remote output was sound.

Bun remote specifiers now use portable generated filenames. The integration also keeps CSS
metadata separate from executable entry publication, accepts namespace-qualified entry metadata,
and normalizes nonempty public-path prefixes before Bun concatenates chunk URLs. The native
integration test verifies a readable ordinary published entry and checks that generated asset
URLs resolve to files in the output inventory. Both Bun versions pass the strengthened test.

The compatibility fixes were made after the timed run. They affect build output and optional
React loader registration, not the native eXact SSR artifacts used by the measured workers.

## Evidence retention

Final validation passed:

- Node 26.8.1: 2,003 package tests passed, five skipped after the compatibility fixes;
  all 77 benchmark-harness tests and 14 eXact/React browser checks passed.
- Node 24.20.0: 1,066 focused runtime tests passed, followed by four loader tests after the fix.
- Node 24.11.1: nine focused loader/remote-adapter tests passed after the fixes.
- Bun 1.4.2 and 1.3.5: all five native adapter/build integration tests passed, including
  ordinary remote output files and emitted asset URL validation. Bun 1.4.2 also passed its
  component compilation, mounting, interaction, and matcher test.
- Updated package builds, test type checking, lint, architecture, JSDoc, platform-boundary
  checks, package-content checks, and the documentation type check/build passed.

The package test runner still emitted listener-count warnings on its own output streams, as it
did before this upgrade. The Node loader subprocesses themselves completed with empty stderr.

Raw captures, preserved failure fixtures, release metadata, checksums, installed paths, and logs
are local artifacts under `.tmp/runtime-upgrade` and are excluded from Git. The performance
capture embeds its runner, runtime binary hashes, artifact identities, interval distributions,
worker telemetry, and error diagnostics. The public framework chart captures remain unchanged.
