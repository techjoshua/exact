# SSR projection plans and final encoding, September 8, 2026

Status: experiments completed. No candidate is adopted in production. Schema preparation, projector allocation, diagnostic branching, and ASCII accounting did not demonstrate a gain sufficient to justify their implementation costs. Encoding the completed HTTP body into a Buffer was slower than the existing string handoff.

## Renderer candidates

Artifact-only variants use the same compiled comparison fixture, preloaded data, output string sink, and byte accounting. Each verifies output identity before timing. Node 26.8.1 and Bun 1.4.2 run sequentially, with 3,000 warmup renders per variant followed by twelve alternating rounds of 10,000 renders. Background workstation load is uncontrolled. Each row has its own control; absolute times across rows are not comparable.

| Candidate                                                           | Node control / candidate, microseconds | Bun control / candidate, microseconds |
| ------------------------------------------------------------------- | -------------------------------------: | ------------------------------------: |
| Cache separate field-name and child-schema arrays                   |                          19.28 / 19.08 |                         18.00 / 18.56 |
| Use generated projectors for small arrays with lightweight ancestry |                          13.97 / 13.78 |                         14.47 / 14.28 |
| Separate diagnostic projection from the successful-request loop     |                          14.02 / 13.82 |                         14.57 / 14.39 |
| Fast ASCII text accounting                                          |                          14.02 / 13.89 |                         14.92 / 14.80 |
| Fast ASCII attribute accounting                                     |                          14.09 / 14.19 |                         14.15 / 14.66 |

Prepared field arrays move tuple indexing into a schema-keyed WeakMap plan but add a lookup and retain derived arrays. They regress Bun. The lightweight-projector probe deliberately changes the supplied ancestor implementation; adopting it would require a compatible new projector contract while retaining version-one native Set behavior. Its roughly 1% difference does not justify that work from this capture.

Separating diagnostics duplicates the projection algorithm to remove successful-path branches. Its small difference does not justify duplicated validation logic. ASCII text and attribute probes retain the original Unicode and escaping path, but do not demonstrate a material renderer gain. No validation requirement is relaxed by a production change.

## Generated projector result allocation

A second probe keeps generated field reads, ownership checks, traversal limits, and validation in their existing order. It replaces allocation of a fixed-length array followed by slot assignments with a final array literal of the validated cells. This requires no new emitted helper signature.

Three list sizes use 1,000 warmup renders and twelve alternating rounds of 2,000 renders per variant. The 20- and 200-incident cases extend the existing fixture with unique incident identities; they add rendered rows as well as hydration data. Output identity is checked at each size.

| Incident count | Node control / literal, microseconds | Bun control / literal, microseconds |
| -------------- | -----------------------------------: | ----------------------------------: |
| 3              |                        17.34 / 16.76 |                       15.24 / 15.06 |
| 20             |                        42.20 / 42.57 |                       41.26 / 41.28 |
| 200            |                      334.93 / 338.78 |                     372.25 / 377.44 |

The original three-incident fixture invokes zero generated projectors, verified by an instrumented artifact. Its timing difference therefore does not demonstrate a benefit from executing the changed allocation. Where larger arrays exercise projectors, this candidate does not improve rendering. An initial run accidentally overlapped Node and Bun; it was discarded and replaced by the sequential capture summarized here.

## Completed-body HTTP encoding

The ordinary Node adapter collects a synchronous producer's string spans before committing the response. The candidate changes only the final successful handoff from `response.end(output)` to `response.end(Buffer.from(output))`. It retains the original producer lifecycle and pre-commit error handling. It does not introduce streaming, a pool, per-span encoding, or a buffer threshold.

Local Node 26 source inspection confirms that Node measures a string's UTF-8 length when preparing the final response chunk. A Buffer supplies its length directly, but creating it adds allocation and changes the transport path. The following test includes those costs rather than assuming that earlier encoding is faster.

Two independent drivers run at total concurrency 32, with five seconds of warmup and ten seconds of measurement per variant. Two fresh process populations reverse variant order. The ordinary eXact writer and React's existing Node `renderToString` path are controls. The original eXact page is 3,611 bytes. The padded case extends each framework's ordinary page to 65,536 bytes using one large trailing value, not additional components.

| Variant               | Original page valid RPS | 64 KiB valid RPS |
| --------------------- | ----------------------: | ---------------: |
| Ordinary eXact        |                   10889 |             7395 |
| Completed-body Buffer |                   10356 |             6998 |
| React                 |                   11892 |             8147 |

Pre-encoding is 4.9% slower on the original page and 5.4% slower on the padded page. It trails the ordinary writer in both populations at both sizes. Ordinary eXact is 8.4% below React on the original page and 9.2% below React on the padded page in this capture. These measurements do not establish parity or change the published charts.

RPS uses valid responses over the union of simultaneous driver measurement spans. All stages, including warmups, have zero request errors. Captures passed artifact stability, response identity, telemetry, and admission/completion accounting checks. Five additional focused checks verify identical final bytes for ASCII, non-ASCII, split surrogate pairs, unpaired surrogates, and empty output. These are narrow checks for the one-line experimental handoff, not a replacement for production lifecycle tests.

## Evidence and conclusion

The existing implementations remain in place. This round does not support further tuning of generic tuple indexing, projector result allocation, or final body encoding. A larger improvement would need a different approach, backed by a measured hot path rather than the apparent simplicity of an individual operation.

The [summary](ssr-projection-plans-2026-09-08.json) includes renderer means and per-population HTTP results. The [evidence archive](ssr-projection-plans-2026-09-08-evidence.zip) retains scripts, raw captures, checks, and compiled artifacts under their original relative paths. Workspace dependencies are required. The earlier [validation review](ssr-validation-costs-2026-09-08.md) explains which guarantees these experiments aim to preserve.
