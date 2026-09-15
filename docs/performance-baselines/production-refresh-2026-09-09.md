# Current production renderer comparison

Date: 2026-09-09. Refreshed after cancellation ownership and sibling hydration compiler fixes.

This measures the actual current production implementation, not the staged writer, byte sink,
string sink, or component-capture experiments. The frozen eXact entry SHA-256 is
`3a0683d59c2264901d7e45eaf686e2d15b51e80eeaabc651f2062e77aea1bba2`.
The React entry SHA-256 is
`44914942423c766956063c2d963b8f384b64470ce1da517c44ef66c6a46a754a`.

Thirty-two fresh processes use production mode, 5,000 warmups and 12,000 measured renders each.
Each runtime/mode/scenario has two reversed framework-order pairs; scenario order also reverses.
Node 26.8.1 and Bun 1.4.2. Both applications render their own full document shell. The assets
scenario has three incidents and four assets; large has 96 incidents and the same four assets.
Workers assert doctype, closing body/html tags, all asset references, and stable document hashes
within each framework. Frameworks have different hydration payloads, so cross-framework hashes
are not expected to match.

React runs from its participant directory and resolves React DOM 19.2.0, using its Node/Bun
conditional server entry. Both frameworks use the same public streaming API category, with full
stream consumption through Response.text. These are renderer measurements, not HTTP requests/s
or browser startup measurements. Each string result includes the framework's hydration/bootstrap
output. All completed samples are retained. No build or test workload ran concurrently.

Means of the two samples, in microseconds per complete render. Positive differences mean eXact
takes more time. Raw individual samples and package resolutions are retained in the archive.

| Runtime | Mode   | Scenario | eXact us | React us | eXact time difference |
| ------- | ------ | -------- | -------: | -------: | --------------------: |
| node    | string | assets   |    36.34 |    22.52 |                +61.3% |
| node    | string | large    |   162.43 |   132.69 |                +22.4% |
| node    | stream | assets   |    55.14 |    67.23 |                -18.0% |
| node    | stream | large    |   193.56 |   339.65 |                -43.0% |
| bun     | string | assets   |    35.62 |    33.23 |                 +7.2% |
| bun     | string | large    |   228.01 |   192.61 |                +18.4% |
| bun     | stream | assets   |    50.58 |    53.16 |                 -4.9% |
| bun     | stream | large    |   284.67 |   267.51 |                 +6.4% |

## What this establishes

eXact wins both Node streaming cases and Bun's smaller streaming case. React still wins all
string cases and Bun's large streaming case. The production performance objective is not met.
The recent correctness fixes did not turn the experimental sink gains into production gains.
Prior HTTP and browser results should not be relabeled with these renderer timings.

Inspection of hydration serialization confirms that the existing implementation already projects
compiler-owned values into positional cells and uses native JSON.stringify. The three script-safe
escape replacements and live own-property checks remain. Previous recorded experiments already
tested combined escape scans and stale-key reuse; repeating those approaches without a new
hypothesis is not warranted. The latter can also miss getter-induced ownership changes.

The staged traversal and sink-specialization work remains the integration candidate, with the
browser-adoption evidence now available. It still requires native compiler/runtime integration
and broader boundary coverage before it can replace this production baseline. This refresh adds
no production code change and claims no new optimization.

Evidence includes the runner, worker, fixed input, both frozen participant artifacts, raw timings,
and verified SHA-256 hashes. Reproduction must execute React from its participant directory to
preserve dependency resolution; the archived copy is for evidence, not an alternate module root.
