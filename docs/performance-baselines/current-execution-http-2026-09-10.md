# Current shared-renderer HTTP comparison, September 10, 2026

Sixteen fresh production worker processes compare the retained eXact build with React across Node and Bun string and streaming modes. Two reversed orders use ten seconds warmup and six seconds measurement, with two load drivers at concurrency 16 each. The service, worker and drivers run at verified below-normal priority (10). The user is actively using this PC; these are diagnostic local comparisons, not a replacement public baseline.

Both applications render their own full document through their component trees. The harness supplies four asset tags and preloads the controlled service data, removing per-request upstream fetching. Every measured response is checked against its participant-specific complete-document identity. No payload padding is used. eXact emits 4,672 bytes and React 3,660. Node uses the Node HTTP adapter; Bun uses its separately built native Fetch entry. React streaming uses renderToReadableStream.

| Runtime / mode | eXact valid requests/s | React valid requests/s | eXact throughput difference |
| -------------- | ---------------------: | ---------------------: | --------------------------: |
| node string    |                5,938.4 |                7,005.3 |                      -15.2% |
| node stream    |                4,965.4 |                3,224.0 |                      +54.0% |
| bun string     |                6,400.3 |                6,962.3 |                       -8.1% |
| bun stream     |                5,037.3 |                4,988.9 |                       +1.0% |

## Individual populations

| Runtime / mode | Order       | eXact requests/s | React requests/s |
| -------------- | ----------- | ---------------: | ---------------: |
| node string    | eXact first |          5,953.6 |          6,992.5 |
| node string    | React first |          5,923.2 |          7,018.0 |
| node stream    | eXact first |          4,896.2 |          3,231.8 |
| node stream    | React first |          5,034.6 |          3,216.2 |
| bun string     | eXact first |          6,551.0 |          6,964.1 |
| bun string     | React first |          6,249.5 |          6,960.6 |
| bun stream     | eXact first |          5,021.4 |          4,926.1 |
| bun stream     | React first |          5,053.2 |          5,051.6 |

All 534,830 measured responses passed identity validation, with zero errors. Each driver completed every started measured request. Rates divide combined valid completions by the union of the two driver measurement windows. Means above are arithmetic means of the two process populations.

## Interpretation and next investigation

Node string remains behind in both orders, while Node streaming remains ahead in both. Bun string remains behind in both orders. Bun streaming is close, especially in the second pair, and does not establish a robust lead. This does not satisfy the overall performance objective.

The earlier in-process full-response-consumption screen favored eXact on Bun string. That screen and this HTTP experiment exercise different transport paths and conditions, so the earlier result cannot establish HTTP superiority. The fresh comparison prioritizes string rendering and response-path attribution on both runtimes. It does not establish that an adapter is the cause. Source inspection confirms that the Node buffered path already calls response.end(body.toText()) once, and the Bun buffered path supplies body.toText() to the native Response constructor. Repeating a chunk-coalescing experiment on these completed-string paths would not address an existing sequence of transport writes.

No production implementation changed. The prior validated shared engine, hydration and lifecycle behavior remain in place. The next useful experiment should isolate completed-document rendering from response ownership and HTTP overhead using the current build, while retaining complete-document identity and both reversed orders. Existing rejected merged-owner and plain-response diagnostics should inform that experiment rather than be silently repeated.

## Artifact identities and evidence

- `framework-comparison/participants/exact/dist-server/server-entry.js`: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
- `framework-comparison/participants/react/dist-server/server-entry.js`: `44914942423c766956063c2d963b8f384b64470ce1da517c44ef66c6a46a754a`.
- `framework-comparison/participants/exact/dist-bun-server/bun-server-entry.js`: `9adc04f4d5d6e78ad95730319a475918c3b4b045da9a93f812c81aa827d60d2e`.
- `framework-comparison/participants/react/dist-bun-server/bun-server-entry.js`: `c626b17de483b079654175da21ebcc77fc8796dbfc954f97210f56d18c83bf43`.

`current-execution-http-2026-09-10-evidence.zip` preserves raw driver results, runner, runtime entries, participant sources, response adapters and the report. Runtime versions: Node 26.8.1 and Bun 1.4.2. All owned benchmark processes exited.
