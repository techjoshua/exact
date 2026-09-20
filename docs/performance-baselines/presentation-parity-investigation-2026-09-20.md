# Presentation parity and paint investigation, September 20, 2026

The benchmark contract required equivalent appearance and behavior, but its acceptance suite did
not compare presentation. eXact, React, and TanStack Start shared equivalent styling through copied
files. SvelteKit and Nuxt had independently maintained styles, including a solid background where
the other three used a full-page radial gradient. SvelteKit also omitted the mobile viewport meta
field. The old five-framework FCP comparison therefore included different visual workloads.

## Controlled paint observations

These are diagnostic counterfactuals, not replacement benchmark scores. Each condition retained
20 post-warmup samples, using the same captured production documents/assets in Windows and WSL
Chromium 149.0.7827.55. Document interception was applied consistently within the experiment.
The normal published benchmark does not intercept documents. Both browsers reported software
SwiftShader rendering; this is not evidence for Windows hardware acceleration versus Linux software.

| Framework | Windows original mean / p50 | WSL original mean / p50 | WSL without gradient mean / p50 |
| --------- | --------------------------: | ----------------------: | ------------------------------: |
| eXact     |                42.2 / 40 ms |            54.4 / 56 ms |                    43.2 / 44 ms |
| React     |                41.0 / 40 ms |            61.2 / 64 ms |                    47.8 / 52 ms |
| SvelteKit |                39.6 / 36 ms |            45.8 / 44 ms |                    42.8 / 44 ms |

SvelteKit had no original gradient to remove. The same eXact document with JavaScript removed
still averaged 55.2 ms on WSL, falling to 40.0 ms when the gradient was removed as well. Font
substitutions did not recover the earlier FCP. These controls identify a paint-workload interaction
with the browser environment. They do not show a uniform browser tax across different documents.

The September 19 eXact client artifact was unchanged across the previous SSR optimization and its
recovery run (artifact SHA-256 f590554a62e260294d4cf2795f3eb1d50140e31e4989f165b11c3de085a03413).
That observation applies to those earlier builds, not to the corrected compiler in this capture.

## Corrected comparison

All seven participants import one stylesheet, retaining the original radial gradient. The native
form wrapper participates in the same button layout. Queue status copy no longer depends on
browser capitalization across framework-specific text-node boundaries. All documents supply
matching titles and viewport metadata.

The controlled gate compares visible copy, selected computed styles, and screenshots at 1280x900
and mobile 390x844. It covers SSR with JavaScript disabled and settled initial, filter, selection,
validation, comment, claim, conflict, analysis, recoverable failure, and empty states. Native gates
compare SSR, filters, deep-linked selected documents, claims, comments, and analysis. They do not
claim to test native queue-click navigation. Screenshots compare participants within one browser
run; no cross-platform golden is accepted. Pixel comparison permits the standard perceptual
antialiasing threshold but zero differing pixels beyond it. Styles and visible text must match.

These checks exposed related eXact compiler/DOM defects:

- Region binder kinds were selected before the complete component dependency/mask contract was
  known. Early state-only or narrow regions could use the wrong subscription when later regions
  introduced props or more than 64 update operations. Binder selection now happens after analysis.
- Generated updates visited descendants before enclosing guards. They now visit parents first;
  structural subscriptions precede ordinary leaf readers, and teardown clears active update snapshots.
- Nested object/array discriminators could subscribe only to their top-level slot. They now retain
  tracked dependencies, so updating comments removes the empty-list message without replacing the
  incident object.

Regression tests exercise mounting, hydration, nested mutations, removal/restoration, and snapshot
retirement. These are implementation corrections within ABI epoch 2 and the 0.6.0 target.

## Bun concurrency investigation

The previously published Bun preloaded-string capture fell from 11,439 RPS at c64 to 10,338 at
c128 (9.6%). The decline was already present, with varying magnitude, in preceding captures.
Two drivers owned 64 active requests each at total c128, below their 256-socket limits. Captures
had no request failures or missed work. Driver CPU did not rise to saturation; worker CPU rose
from roughly 135% to 149% of one core while completions fell. Worker RSS remained around 92 MB.
This does not support a client socket-limit explanation.

Instrumented admission traces showed more event-loop lag at c128, including when admission was
enabled. Enabled windows had lower lag than immediate controls (roughly 10 ms versus 16-17 ms in
that diagnostic). Disabling admission is therefore not supported as a fix. These phase observations
are diagnostic correlations within an adaptive run, not independently randomized treatment estimates.

A larger maximum batch of 128 and removal of per-request CPU sampling were tested separately.
The batch-128 run improved absolute throughput, including c16 where the batch limit should not
bind, but still declined between c64 and c128. The matched batch-32 run did not reproduce that
concurrency decline. One live docs-source edit also overlapped the exploratory batch-128 run.
The apparent absolute gain is insufficient evidence to change the adapter default. Removing the
CPU samples did not produce a useful recovery. No speculative Bun adapter change is retained.

A separate candidate coalesced a render checkpoint occurring synchronously inside an already
admitted request. Counters confirmed that preloaded requests reached this checkpoint. Two fresh
populations per framework, with reversed framework order and unchanged production artifacts,
compared the candidate with the default batch-32 control. The candidate changed eXact/React
ratios by +7.2% at c16, -6.1% at c32, -2.8% at c64, and +5.2% at c128. At c128, eXact increased
from 9,749 to 10,140 aggregate RPS, while at c32 it fell from 10,114 to 9,606. Both captures had
zero request errors. The candidate is rejected because it did not provide recovery without
regressions. This experiment used a diagnostic worker wrapper, not a shipped adapter change.

The full matrix coordinator was paused after its Bun preloaded-string capture completed, while
these isolated candidate/control runs executed. It resumed on the same source and artifacts;
no timed runs overlapped. The coordinator journal duration for that completed step includes the
pause, while the driver's recorded stage durations and rate calculations do not.

The final sustained Bun string capture measured 9,671 RPS at c64 and 9,418 at c128, a 2.6%
decline compared with the prior capture's 9.6%. Absolute throughput was also lower. This is a
repeat of identical server artifacts, not a claimed adapter optimization. The final browser
capture with matching presentation measured eXact FCP at 51.47 ms mean / 48 ms p50, React at
54.80 / 52, SvelteKit at 55.73 / 52, Nuxt at 53.33 / 48, and TanStack Start at 51.73 / 48.
The full results are in the [presentation-parity capture](presentation-parity-2026-09-20.md).
The [evidence archive](presentation-parity-2026-09-20-evidence.zip) includes the investigation's
raw controls, candidate workers, test logs, and source verification.

The final sustained capture must be consulted for the current curve. A higher-concurrency decline
alone cannot identify thread starvation, and these experiments do not establish a Bun-internal root
cause. All raw populations and candidate limitations are retained.

## Interpreting the repeated server measurements

The current Node and Bun string/stream server entry artifacts, server package directory, and runtime
adapters match the September 19 recovery capture byte for byte. The recorded sustained-load runner,
plans, transports, and runtime configuration also match. Presentation and guarded DOM corrections
therefore do not explain differences in those server capacity scores. The eXact/React ratio changes
are still reported as requested, including negative changes; artifact identity prevents attributing
those changes to a new SSR implementation.

For example, adjacent worker telemetry samples around Node streaming c32 show React user CPU falling
from roughly 223 to 180-190 microseconds per completed response, and system CPU from 53-55 to about
28 microseconds. eXact user CPU rose from 80-85 to about 89 microseconds, with system CPU remaining
around 16-18 microseconds. These are approximate interval observations, not isolated function costs.
The unchanged workloads experienced different execution costs, so a single React ratio is not a
stable conversion between these two host sessions. The evidence does not isolate the responsible
host or runtime condition. It would be inaccurate to claim either full historical recovery or a
new SSR code regression from this capture.

## Validation

The controlled suite passed 39 string and 25 streaming checks on each runtime; the native suite
passed 12 checks. Native compiler tests passed. The DOM/reactive/hydration/SSR package run passed
1,202 tests and failed the two pre-existing document-adoption tests described below. The comparison
unit suite passed 94 tests. Platform-boundary, ABI, package-content, changed-source lint, and test
TypeScript checks passed. The docs application passed typecheck and production build; browser
verification checked all 17 distribution tables, five heap rows, and four capacity chart groups
at desktop and mobile sizes, without page errors or horizontal overflow. All 25 execution stages
completed successfully. Source verification checked 3,184 files; only subsequent README prose
changed within the measured source inventory.

## Separate findings, outside the performance correction

- Native eXact queue-click navigation reaches an unlowered `TaskContext.client()` default when a
  task is only passed through a helper's operations object. The existing native timed scenarios use
  deep links and do not exercise that callback. The failing diagnostic and original source are retained.
- The controlled eXact Bun streaming entry omits the required `body` field of `ExactResponseLike`.
  It runs in the browser/SSR suite but fails the existing participant TypeScript check.
- Two existing complete-document hydration adoption tests fail in both string and streaming modes.
  The failures also reproduce with both the prior compiler and prior DOM implementation. Other focused framework tests passed.

The unrelated failures were not repaired or represented as passing checks.
