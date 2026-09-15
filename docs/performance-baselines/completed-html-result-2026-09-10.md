# Completed HTML result experiment, September 10, 2026

Status: the simpler result wrapper is integrated and rebuilt as a candidate. Focused response-consumption measurements favor it on both runtimes; full HTTP performance acceptance remains pending. The overall React comparison goal remains unmet.

## Change and hypothesis

The collecting renderer finishes ordinary HTML as one string. The former result wrapper still installed an HTML getter and allocated private storage for it, and the hydratable wrapper installed another getter forwarding to the first. The hypothesis was that publishing the already-completed string as an ordinary own data property would remove unnecessary result construction without inspecting the string's characters or undoing the earlier shared-getter GC improvement.

The implementation removes those two HTML accessors and the plain result's storage object. Combined htmlWithHydration remains lazily joined and cached; resumption reads remain deferred. Multi-chunk inputs to the internal factory are joined when creating the plain result. Its html value is a completion snapshot rather than a first-read snapshot of the internal chunk array. The hydratable result also snapshots the source html value. These are explicit unreleased representation changes; compiler helper signatures and emitted artifact semantics are unchanged. Enumeration order and public field names remain intact.

The source test now checks completed snapshots instead of prescribing deferred reads of a mutable internal chunk array. Independent hydrated results, deferred resumption reads, metadata, hydration placement across arbitrary chunk boundaries and malformed documents remain covered. Engineering documentation and the docs application's SSR explanation are updated.

## Measurements

Frozen bundle prototypes use the current pre-change artifact, SHA-256 `069f9784fa667af7896202923a6c08622ae1bb3f4060054328314dbe1ae6619b`. Production processes warm 50,000 times and run in two reversed orders. The PC was in active use, so small timing differences are provisional. Complete output hashes match, including four asset tags and the application-owned shell.

The response-consumption screen measures 20,000 small-document iterations per population. Each iteration renders, constructs a Response, and awaits text consumption. This is not an HTTP capacity measurement.

| Runtime | Current microseconds/render | Candidate microseconds/render |
| ------- | --------------------------: | ----------------------------: |
| Node    |                       35.21 |                         33.72 |
| Bun     |                       34.25 |                         31.98 |

Both pairs improve on each runtime. The observed mean reductions are approximately 4.2% and 6.6%.

Separate Node inspector captures measure 10,000 renders after warmup, at a 16 KiB sampling interval including minor-collected and major-collected objects. Sampled allocated bytes/render are essentially unchanged: approximately 73.14 to 72.97 KB for three incidents and 544.33 to 543.93 KB for 96 incidents. This does not establish a meaningful total-allocation reduction.

Separate Node GC captures cover 20,000 renders per population. Small-document event counts are 90/89 for the control versus 88/87 for the candidate. Large-document counts are 327 in all four populations. Mean summed event durations are 15.92 to 14.52 ms for small documents and 69.37 to 67.04 ms for large documents. These elapsed durations are not GC CPU time and remain subject to workstation load. No GC regression was observed in this screen.

## Integration and remaining work

The source integration also consolidates the remaining hydrated-result descriptor declarations. All 352 SSR tests in 55 files pass, test typechecking passes, the SSR package builds, and targeted ESLint and formatting checks pass. The comparison client and both server applications rebuilt. All 56 browser checks pass across Node/Bun string/stream, covering both comparison frameworks. No fresh HTTP throughput result is claimed for the rebuilt candidate.

Integrated Node artifact: `9093d5a3f3fdc1df26aa016be083964eace4f50ddb87766312e813331dd235b3`.

Integrated Bun artifact: `8dade5311d0d8aa001b9275fc28a5f21e61fe48bd03bcff012ed4c484a99ada7`.

This does not resolve the prior Bun HTTP regression by assumption. A paired HTTP comparison is still required. The earlier body-boundary prototype remains outside production.

Follow-up: the [paired HTTP comparison](completed-html-http-2026-09-10.md) is now complete. It finds a Node string improvement with small Node-streaming and Bun-string regressions; the broader goal remains unmet.

Package-content, JSDoc, explicit-any (73/73), and release-ABI checks pass. The release check retains the initial epoch-1 baseline at 0.5.0; frozen fixtures were not regenerated.

Evidence: `completed-html-result-2026-09-10-evidence.zip` contains the control, prototype and integrated artifacts, transformation and measurement scripts, raw allocation samples, GC and response-consumption populations, source snapshots and browser logs.
