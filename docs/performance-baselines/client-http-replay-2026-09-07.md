# Captured production pages over HTTP � 2026-09-07

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Status: completed; public browser charts and heap composition refreshed locally.

## Method and ownership

The client benchmark now defaults to production-page replay. Capture one complete incident HTML
response and freeze matching asset bytes for each framework before timed samples. Stop framework
servers, restart the deterministic shared service, and serve the frozen bytes at the original
origins through one common Node HTTP implementation. No browser interception or SSR fallback.
Document hydration bytes and semantic headers remain intact. Connection/framing headers are
regenerated; responses are uncompressed and no-store. Runtime API and event-stream requests remain
live. Missing replay resources invalidate evidence. Capture-time router timestamps are not rewritten;
client revalidation remains part of client behavior. The source-only replay boundary has an HTTP
regression test that stops the renderer and modifies disk assets before repeat requests.

This belongs to the comparison harness, not the framework runtime. No framework behavior changed.
Live-server mode remains available through COMPARISON_CLIENT_MODE=live. Streaming SSR, production
compression/CDN caching, and cold browser-process startup are outside the replay measurement.

## Population and acceptance

- All 35 shared live-server correctness checks passed after production builds.
- 50 browser rounds � five frameworks, plus one discarded round. Each framework appeared ten
  times in every order position; rotation cycles reverse direction.
- 10 separate post-interaction, post-GC heap snapshots per framework, plus one discarded round.
- 30 startup samples per framework at each of 1�, 4�, and 6� Chromium CPU throttling. Separate
  intrusive diagnostic profiles follow the timed startup samples.
- Every sample uses a fresh HTTP-cache-disabled context; Chromium's process stays warm.
- Client artifact hashes agree across browser, heap, and startup captures.
- Document counts: 51/framework for browser; 11/framework for heap; 91/framework for startup
  including its final diagnostic scenario. No missing replay requests. Framework servers stopped
  throughout replay samples. Actions and authoritative version/owner changes remained functional.
- Environment: Node v24.11.1, Chromium 149.0.7827.55, Windows,
  AMD Ryzen 7 8745HS. Worktree dirty, commit ece37924701788e333c6f62231c6bd0726b8e987.

## Browser results

Arithmetic means. Navigation completion is the load event, not hydration readiness. Heap is retained
post-interaction JavaScript heap, including V8 code and metadata, in decimal MB.

| Framework      | Navigation ms | FCP ms | Optimistic ms | Settlement ms | Heap MB |
| -------------- | ------------: | -----: | ------------: | ------------: | ------: |
| exact          |         29.11 |  42.32 |          1.57 |         13.85 |   2.483 |
| react          |         36.53 |  46.00 |          1.46 |         13.65 |   2.303 |
| sveltekit      |         30.55 |  39.84 |          1.40 |         13.54 |   2.078 |
| nuxt           |         40.07 |  43.20 |          1.10 |         13.98 |   2.334 |
| tanstack-start |         48.51 |  41.52 |          1.58 |         13.72 |   2.760 |

Do not attribute differences from the older live-server capture to a runtime optimization. Serving
fixed bytes removes SSR generation and framework transport variation. It does not remove browser
scheduling, JIT, GC, shared-service costs, or host activity. 50 samples give descriptive percentiles;
P99 is effectively the largest sample, not a well-established tail capacity estimate.

## Evidence and publication

- Browser raw samples (local capture: `client-http-replay-2026-09-07-browser.json`)
- Heap composition raw samples (local capture: `client-http-replay-2026-09-07-heap.json`)
- Startup raw samples and profiles (local capture: `client-http-replay-2026-09-07-startup.json`)

Raw evidence retains per-resource hashes, byte sizes, document headers, delivery policy, orders,
request accounting, and build identity. Pages are captured once per command, not recaptured per sample.
Publication recomputes browser statistics from raw samples and rejects live, incomplete, nonpublishable,
or position-unbalanced evidence. Server capacity, response-time, payload, and server-memory data
are preserved with their independent dates.

From repository root:

```sh
node framework-comparison/src/publish-client-report.mjs docs/performance-baselines/client-http-replay-2026-09-07-browser.json
node scripts/component-local-target-abi/publish-docs-heap-report.mjs docs/performance-baselines/client-http-replay-2026-09-07-heap.json
```

Validation: 74 comparison tests; 8 related adapter/heap-publication tests; targeted ESLint and
Prettier; docs TypeScript check and standalone production build; desktop/mobile rendered chart
values match published data, no page errors or horizontal overflow. Eight distribution tables and
five heap rows verified on each viewport. Task-owned measurement and verification processes closed.
