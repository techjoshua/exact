# Shared Intl fallback lists, September 22, 2026

Locale fallback lists now have bounded reuse across separate Intl environments and SSR requests.
The runtime shares only frozen arrays of locale strings. Mutable locale state, catalogs, translated
messages, callbacks, and missing-message reporting remain owned by each environment.

This extends the [per-environment cache](intl-fallback-cache-2026-09-22.md). It does not replace that
cache or claim another 33% SSR improvement. Fresh mixed-locale request batches improved consistently
in this experiment; same-locale and reused-environment results varied in direction.

## Ownership and bounds

`packages/intl/src/locale-resolution.ts` owns normalization and fallback-list construction. Its
module-owned LRU retains up to 128 locale entries. Each environment keeps its current list as a
fast path, consulting the shared pool on first lookup or locale change. Eviction removes only the
pool reference, so live environments keep valid immutable lists. Standard environment locale state
is canonical; direct state writes still receive normalization and validation on a pool miss.

Several locales can be retained simultaneously. SSR requests need not reuse an `IntlEnvironment`
to benefit. Each worker or independently loaded copy of the runtime has its own pool. The cache
does not cross process boundaries, persist across restarts, or automatically share environments.
Environment construction still validates its locale, descriptors, and catalogs; those costs are
not removed. Public APIs and compiler/runtime ABI signatures are unchanged.

Tests cover frozen list identity, locale separation, invalid input, least-recently-used eviction,
survival of evicted lists held by live callers, reuse by fresh environments, independent catalogs,
callbacks and mutable locale state, plus the existing reactive and catalog-update cases.

## Paired SSR method

Framework base: `c8858f5a956ea2ca5475318356efd8c5ca457bb3`. Both variants include the earlier
uncommitted profiling harness and per-environment fallback cache. The baseline adds the new
request fixture; the candidate adds shared fallback lists. The worktree was dirty throughout.
The SHA alone cannot reconstruct these variants: use the accompanying maintained fixture,
runner, and source change, and the earlier report's per-environment implementation description.

Environment: Node 26.9.0, Linux x64, WSL2 `6.18.40.1-microsoft-standard-WSL2`, AMD Ryzen 7 8745HS.
The production compiler builds unminified server fixtures. Timing runs without a DOM. Builds,
tests, and profiling did not run concurrently with measurement; existing machine services remained.

The runner measures one-message and 100-message responses in four modes:

- `reused-same`: one retained environment using a French regional locale and language catalog.
- `fresh-same`: a new environment and catalog preparation for every render of that request.
- `reused-mixed`: four requests with retained independent environments, three locales, and four
  distinct expected messages. Two French requests deliberately have different catalogs.
- `fresh-mixed`: the same four requests, each creating its own environment during measurement.

Mixed batches use `Promise.all` and include French, German, and a Chinese locale with script,
region, and Unicode extension. Every rendered result must contain its own expected translated text
for every message. These synchronous message fixtures do not force asynchronous component suspension.
Batch wall time is divided by request count: the metric is amortized batch cost, not individual
concurrent-request latency. Fresh timing includes environment, descriptor, and catalog preparation.
Output assertions execute after each timed batch. Network and streaming behavior are not measured.

Four paired rounds alternate variant order and reverse workload order. Each of 64 workers starts
in a fresh process, runs 200 warmup batches, and retains 31 observations averaging 16 batches each.
The first process-level lookup is excluded by warmup; fresh environments are still created for every
measured fresh-mode request. Values below are medians of the four process medians in milliseconds.

| Mode                  | Messages/request |  Before |   After | Change | Paired change range |
| --------------------- | ---------------: | ------: | ------: | -----: | ------------------: |
| Reused, same locale   |                1 | 0.02958 | 0.03002 |  +1.5% |    -26.0% to +43.6% |
| Reused, same locale   |              100 | 0.42132 | 0.41121 |  -2.4% |     -25.4% to +7.6% |
| Fresh, same locale    |                1 | 0.08232 | 0.08065 |  -2.0% |      -9.4% to +7.4% |
| Fresh, same locale    |              100 | 0.46272 | 0.43942 |  -5.0% |      -7.7% to +4.2% |
| Reused, mixed locales |                1 | 0.01553 | 0.01590 |  +2.4% |     -5.7% to +12.7% |
| Reused, mixed locales |              100 | 0.36115 | 0.36592 |  +1.3% |      -9.8% to +4.3% |
| Fresh, mixed locales  |                1 | 0.06613 | 0.05544 | -16.2% |     -36.6% to -9.1% |
| Fresh, mixed locales  |              100 | 0.43218 | 0.42368 |  -2.0% |      -7.1% to -0.7% |

Both fresh mixed-locale workloads improved in every pair. All other workloads had pairs in both
directions, so their aggregate percentages do not establish consistent improvements or regressions.
The unit test independently confirms that a second environment's first message lookup reuses native
fallback work; sampling or noisy wall-clock results are not the sole evidence of cache reuse.

The earlier per-environment cache removed repeated work for every message. This addition removes
one fallback-list build per new environment or locale change when that locale remains pooled.
Its relative benefit is therefore smaller for message-heavy responses. These results do not
establish cold-process performance, memory savings, browser performance, or behavior under more
than 128 actively competing locales. Functional tests protect eviction; timing under eviction
pressure remains unmeasured. The original warmed-environment 33% improvement must not be presented
as the measured gain for fresh request environments.

## Reproduction and artifacts

Rebuild each runtime variant and compile the same fixture:

```sh
node scripts/benchmark-enhancement-comparison.mjs --build <workspace> <artifacts> after --sourcemap
node scripts/benchmark-intl-requests.mjs --compare <before-artifacts> <after-artifacts> <output>
```

The [fixture README](../../scripts/performance-fixtures/enhancement-comparison/README.md) documents
the maintained worker controls. Raw observations, bundles, maps, hashes, logs, and the working
comparison summary stay under ignored `.tmp/intl-shared-fallback`, following the
[retention policy](benchmark-retention.md).

| Server artifact       |   Bytes | SHA-256                                                            |
| --------------------- | ------: | ------------------------------------------------------------------ |
| Per-environment cache | 518,256 | `456d5a93ff86e98e2e741a1c7756c01a942dec843c944aaff027fc95a220565c` |
| Shared fallback lists | 518,739 | `1b9f8785c73073353d7ecdba11d23f54fcc02e51bb948bcd19812b996742157c` |

The 483-byte increase describes this unminified diagnostic server bundle, not a production download.

Validation passed the Intl package build, 238 Intl tests across 28 files, all 64 benchmark workers,
test typechecking, focused ESLint, JSDoc, source architecture, package-content checks, and the
documentation application's typecheck and production build. No package was published.
