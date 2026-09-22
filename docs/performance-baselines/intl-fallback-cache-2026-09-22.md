# Intl locale fallback reuse, September 22, 2026

The subsequent [shared fallback-list change](intl-shared-fallback-2026-09-22.md) adds bounded reuse
across separate environments and measures fresh-request and mixed-locale workloads. The original
capture below measures the earlier per-environment cache with reused environments.

Retaining one locale fallback chain per Intl environment reduced string SSR by 33.1%, streaming
SSR by 29.9%, and scalar update time by 10.5% in the existing Intl fixture. All four paired rounds
improved in those three metrics. Mount and hydration medians improved but individual pairs changed
in both directions. This is a bounded workload result, not a general application speedup.

## Change and correctness

`createIntlEnvironment()` previously canonicalized the locale and rebuilt its fallback candidates
on every message lookup. It now computes that list on first lookup and replaces it when the
observed locale changes. Storage is bounded to the current locale and its candidate list, owned
by the environment. There is no cache of previously visited locales and no new global cache.

Every lookup still reads reactive locale state, even when another message populated the cache.
Catalog lookup, generated-artifact synchronization, translation materialization, missing-message
reporting, and pseudo-locales keep their existing behavior. The cache stores locale candidates,
not message results. Computing the replacement before publishing its locale key preserves errors
from invalid locale input. Direct mutation of observable locale state also invalidates selection.

Three focused tests cover warmed independent readers, locale changes, direct state mutation,
catalog replacement after warming, a cached miss followed by added catalogs, extension/region/script/
language precedence, independent locale scopes, and avoiding repeated native normalization.
The full Intl suite also covers lazy artifacts, pseudo-locales, structural messages, SSR, hydration,
and lifecycle behavior. This is an internal optimization of the unpublished 0.6.0 package; public
APIs, manifests, helper signatures, and ABI epochs are unchanged.

## Controlled measurement

Baseline framework source is `c8858f5a956ea2ca5475318356efd8c5ca457bb3`, with the profiling harness
and optional fixture observers from the [initial profiling report](enhancement-profile-2026-09-22.md).
The candidate is that worktree plus the fallback cache in `packages/intl/src/environment.ts`.
Both variants contain uncommitted diagnostic additions, and the candidate implementation was also
uncommitted during measurement. The SHA alone does not reproduce either complete diagnostic variant.
The source change accompanies this report; the generated before/after bundle diff was verified to
contain only the fallback-cache implementation change.

Environment: Node 26.9.0, JSDOM 25.0.1, Linux x64, WSL2 kernel
`6.18.40.1-microsoft-standard-WSL2`, AMD Ryzen 7 8745HS. The Intl package and client/server fixtures
were rebuilt before measurement. No task-owned build, tests, or other benchmark ran during capture;
existing background services remained running.

Four alternating before/after pairs use the maintained protocol-2 worker: 100 receivers, ten
updates, 20 client warmups, 500 server warmups, and 21 samples per process. SSR runs without a DOM.
Client mount/update and hydration use separate fresh processes for plain and Intl workloads.
Server workers also retain the other existing enhancement workloads as controls. The following
values are medians of the four process medians in milliseconds.

| Intl metric | Before |  After | Change | Paired changes                 |
| ----------- | -----: | -----: | -----: | ------------------------------ |
| String SSR  |  0.866 |  0.579 | -33.1% | -33.8%, -36.2%, -17.4%, -32.4% |
| Stream SSR  |  0.911 |  0.639 | -29.9% | -27.2%, -30.3%, -22.3%, -31.3% |
| Mount       |  9.663 |  9.108 |  -5.7% | +3.4%, -44.0%, +14.6%, -12.2%  |
| Ten updates | 31.276 | 27.991 | -10.5% | -7.0%, -16.4%, -6.7%, -13.8%   |
| Hydration   |  6.842 |  5.917 | -13.5% | +2.5%, -17.7%, -14.4%, -14.7%  |

The fixture uses a module-owned environment and one source-language scalar message descriptor.
Warmups populate the cache before retained samples. This does not measure environment construction
per request, cold first lookup, repeated locale switching, rich structural messages, or a translated
catalog population. A new environment still pays the first fallback-chain computation. Native
browser layout and paint are not measured. Client text/host/owner checks passed; every recorded
hydration sample retained 100 receivers and replaced zero elements. SSR string/stream byte counts
matched, and Intl HTML remained 29,402 bytes on both sides.

## Separate profiles

Two profiling passes per variant use fresh client, hydration, and server workers, reversing variant
order in the second pass. The inspector requests a 100-microsecond sampling interval after warmup,
with 150 client or 1,000 server iterations. Phase windows exclude assertions, client teardown, and
hydration-input parsing. These profiles are separate from the timing runs above.

`localeFallbackChain` accounts for 27.83% / 28.42% of baseline string SSR samples, 26.01% / 26.04%
of streaming samples, and 9.84% / 10.16% of update samples. Neither it nor `getCanonicalLocales`
appears in the warmed candidate phase samples. The normalization regression test independently
checks reuse; sampling absence by itself would not prove zero calls. Profile shares are inclusive
attribution, not guaranteed removable wall time.

## Plain controls and timing variance

Initial plain controls shifted despite exercising no message lookup: median string SSR +5.6%,
stream SSR +7.4%, mount +13.7%, updates +6.8%, and hydration +16.3%. All except hydration had pairs
in both directions. These shifts must not be silently discarded or presented as regression safety.

A subsequent six-round hydration control included two independently executed copies of the same
baseline artifact and one candidate. Order rotated across all three labels, with the same 20
warmups and 21 samples in each fresh process. Median-of-medians results were:

| Artifact label                 | Plain hydration ms |
| ------------------------------ | -----------------: |
| Baseline A                     |              2.408 |
| Baseline B, identical artifact |              2.547 |
| Candidate                      |              2.403 |

Candidate versus baseline A varied from -12.1% to +13.0%; identical baseline B versus baseline A
varied from -0.6% to +27.0%. The initial consistent hydration slowdown did not reproduce. This
demonstrates substantial process timing variation and does not establish a plain-workload speedup
or a universal absence of regression. The larger Intl SSR improvement was consistent across all
four pairs and agrees with the disappearance of the targeted profile hotspot.

## Artifacts, reproduction, and retention

Unminified client bytes changed from 877,798 to 877,990; server bytes changed from 511,496 to
511,688. Each grew 192 bytes. These are diagnostic bundles, not production-minified downloads.

| Artifact      | SHA-256                                                            |
| ------------- | ------------------------------------------------------------------ |
| Before client | `393bda122f036378ec0d53466df382b916ce0ec61225750225ea17f547a1daf9` |
| After client  | `e41311dbef19f37383169a3b6ff0a70eae1bd4426e06b3a28b875c04150083cd` |
| Before server | `b1ee1bd8f90340807d2d043ff0b7bf6c0ba9b1004f027bcc0af93e422393d769` |
| After server  | `6bd52ee2d3fa4f05a1c9c8874254597eaba8151d39f5ae369b807377056b6b43` |

Build each variant with `benchmark-enhancement-comparison.mjs --build <workspace> <artifacts>
after --sourcemap`. Invoke its `--measure-server <artifacts> <result.json>` worker and
`--measure-client` / `--measure-hydration <artifacts> <result.json> <kind>` workers for `plain`
and `intl`, alternating variant order across four rounds. Summarize each process first, then take
the median of its four medians. Profile separately with
`profile-enhancement-comparison.mjs --worker <variant-directory> intl <lane> <round>`; each variant
directory must contain its `artifacts` subdirectory. The maintained profiling runner documents
phase accounting in the [fixture README](../../scripts/performance-fixtures/enhancement-comparison/README.md).

Raw samples, private orchestration, bundles, source maps, profiles, and logs remain in ignored
`.tmp/intl-fallback-cache`, following the [retention policy](benchmark-retention.md).

Validation passed the Intl package build, 235 Intl tests across 27 files, test typechecking,
focused ESLint, JSDoc, source architecture, and package-content checks. No package was published.
