# Integrated execution-target comparison with React

Status: focused measurements of the rebuilt integration, not a new published HTTP baseline. eXact improves on React in three of the four measured response-consumption cases, but Node string consumption remains slower. The overall performance goal is not achieved.

## Comparable response consumption

Sixteen fresh production processes cover Node 26.8.1 and Bun 1.4.2, string and streaming entry points, two reversed framework orders and the three-incident fixture. Each process warms 50,000 iterations and measures 20,000. All processes run at below-normal priority 10, one at a time, while the user uses the workstation. No builds, tests or other agent-owned profilers run alongside measurement.

String consumption renders the full string, constructs a Response and awaits its text. Streaming consumption constructs a Response from the framework's returned stream and awaits its full text. Both frameworks render their own document component and application tree. All four asset tags and full document boundaries are checked, and complete hashes match within each framework/mode across populations. eXact emits 4,672 bytes and React 3,660 bytes. Framework outputs intentionally differ, including hydration representation, so their hashes are not compared to each other.

React is 19.2.0. Resolution metadata identifies `react-dom/server.node.js` on Node and `react-dom/server.bun.js` on Bun. React's string entry uses renderToString and its streaming entry uses renderToReadableStream. eXact's public hydratable string and progressive HTML APIs share the renderer. These measurements use the server entry bundle on both runtimes and do not exercise the runtime-specific HTTP adapters or sockets.

Mean microseconds per complete response consumption:

| Runtime | Mode      | eXact | React | eXact elapsed-time difference |
| ------- | --------- | ----: | ----: | ----------------------------: |
| Node    | String    | 42.56 | 35.90 |                  18.5% longer |
| Node    | Streaming | 45.55 | 75.37 |                 39.6% shorter |
| Bun     | String    | 36.64 | 46.85 |                 21.8% shorter |
| Bun     | Streaming | 66.62 | 76.74 |                 13.2% shorter |

All pair directions agree within each row. Individual eXact/React pairs, in microseconds:

- Node string: 41.88/35.25 and 43.24/36.55.
- Node streaming: 47.74/73.10 and 43.36/77.64.
- Bun string: 36.20/46.78 and 37.09/46.91.
- Bun streaming: 67.44/78.09 and 65.80/75.39.

The Node string gap is approximately 6.66 microseconds per consumed response in this screen. Bun's string direction differs from the older HTTP result. That warrants examining the adapter/transport with fresh HTTP measurements; it does not prove the adapter alone explains the difference, because the build, measurement method and workstation conditions also differ. These are elapsed-time comparisons, not requests-per-second capacity results.

## Current Node string profile

Four additional fresh Node production processes profile the encoded-string case in two reversed framework orders. Each warms 50,000 iterations, then profiles 30,000 consumed responses using a requested 100-microsecond CPU sampling interval. Processes retain below-normal priority. The capture records process CPU usage separately from sampled stacks, and the complete output remains checked.

Profiled process CPU per render is 63.03 and 68.23 microseconds for eXact, versus 47.93 and 45.83 for React. These instrumented values include profiling overhead and must not replace the unprofiled timings above.

Across the two eXact profiles, 6,749 leaf samples were collected. Notable self-sample shares are serializeJson 5.02%, validatePositionalValue 3.63%, startsExactDocument 3.35%, scriptSources 3.24%, native encoding's encode method 3.04%, createChunkedHydratableResult 2.83%, GC 2.64%, renderProgramWriter 2.07% and markerPair 2.03%. React's 4,954 samples include Document 7.39%, escapeTextForBrowser 7.21%, retryNode 6.94%, push 5.65%, pushStartInstance 4.64%, renderElement 4.58% and GC 3.55%.

These percentages are shares of different sample populations, not interchangeable CPU budgets. Leaf attribution may include native work or optimized/inlined work, and sampling during shared-PC use has limitations. React's Document includes bootstrap serialization and asset parsing. It would be incorrect to count those as absent from React or to remove equivalent application work only from eXact.

Source review confirms that document-prefix recognition still inspects completed string chunks before hydration insertion. Earlier native-predicate and body-boundary experiments already tested related optimizations, including Bun regressions. Their [native predicate](native-document-probes-2026-09-10.md) and [body-boundary allocation](body-boundary-allocation-2026-09-10.md) results remain relevant counterevidence. No repeat or source change is justified solely by seeing this function in a profile. Likewise, serializeJson's sampled share is not a promise of savings from replacing JSON.stringify; earlier direct serialization measurements showed much smaller isolated costs.

## Provenance and remaining work

The measured eXact Node bundle is the integrated artifact `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`. React's entry bundle is `44914942423c766956063c2d963b8f384b64470ce1da517c44ef66c6a46a754a`; its renderer dependencies remain external and their version/resolution metadata is recorded. The integration's 360 SSR tests, 56 browser checks and 24 suspension comparisons are documented in [the implementation report](direct-execution-target-2026-09-10.md).

The current integrated build has now been measured against React, but a same-method allocation confirmation against its own preceding build remains outstanding. Fresh comparable Node/Bun HTTP string/stream measurements and further work on the Node string gap are also outstanding. No new framework or application behavior changed in this investigation.

`direct-execution-react-2026-09-10-evidence.zip` preserves the sixteen unprofiled populations, four CPU profiles and metadata, profile analysis, workers/drivers, fixture data, measured server entries, relevant application source and this report. Measurements made before integration remain separate evidence.
