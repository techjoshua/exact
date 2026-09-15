# Hydration escape guard, September 9, 2026

Status: not adopted. Production retains the synchronous-publication callback build and preceding
improvements. No production source, API, ABI, or public benchmark charts changed.

## Hypothesis and method

Hydration JSON currently escapes less-than signs and Unicode line/paragraph separators in three
replacement operations. A single non-global regex guard could return ordinary JSON directly and
retain the existing three replacements only when needed. Hypothesis: a 1-3% gain, particularly on
large ordinary payloads. This differs from the previously rejected one-pass replacement callback.

The bundle-only prototype changes only the private serializer. Thirty-two fresh production
processes cover Node/Bun, string/stream, 96 ordinary incidents, and a separate 3-incident escaped
case. The latter appends repeated closing/opening script tags, quoted text, and U+2028/U+2029 to
incident titles. Each combination uses two reversed-order pairs, 5,000 warmups, and 12,000 measured
renders. Streams are fully consumed through Response.text; full application-owned documents have
empty asset tags. Every final document hash and document-framing check matches the eXact control.

Median microseconds per render, lower is better. Positive paired change means slower. Paired
change is the median of per-round percentage changes, not a ratio of independent medians.

| Runtime | Mode   | Case    | Previous | Prototype | Paired change |
| ------- | ------ | ------- | -------: | --------: | ------------: |
| bun     | stream | escaped |   121.03 |    122.26 |         +1.0% |
| bun     | stream | large   |   282.85 |    287.95 |         +1.9% |
| bun     | string | escaped |    96.43 |     95.48 |         -1.0% |
| bun     | string | large   |   233.67 |    236.43 |         +1.2% |
| node    | stream | escaped |   127.10 |    126.50 |         -0.5% |
| node    | stream | large   |   186.84 |    189.35 |         +1.3% |
| node    | string | escaped |    94.15 |     96.21 |         +2.2% |
| node    | string | large   |   164.71 |    159.74 |         -2.9% |

Results are mixed, with no consistent ordinary-payload gain across modes/runtimes. Several
escaped-input cases also regress. The prototype is not retained. Short shared-PC samples do not
establish confidence intervals; no arbitrary improvement threshold was used.

## Root-bound audit correction

Before this experiment, the root byte-bound shortcut was reexamined. The earlier bounded prototype
already implemented the exact proposed shortcut: skip the root sink when there are no resource
hints, use a three-bytes-per-UTF-16-unit upper bound, and count exactly near the limit. It was not
rerun. Its existing results were mostly neutral or slower.

The root byte count is not duplicate descendant accounting, but describing exact counting as
always necessary would be too strong. A conservative upper bound can prove output is within the
limit without counting every byte. The reason to retain the current implementation is the measured
tradeoff, not impossibility of a correct alternative. See the earlier SSR allocation report for the
original experiment, and counter-static-2026-09-09 for the native/portable counter comparison.

## Scope and evidence

No production tests were rerun for a discarded bundle prototype. Full-response hash parity covers
the measured safe and escaped documents, not all possible serializer inputs. In particular the
prototype is not a public-contract redesign for undefined JSON results. React was not rerun, and
there is no new HTTP throughput or browser timing claim.

The archive includes the source builder, worker with escaped input, runner, raw populations,
control/prototype bundles, fixed data, and the serializer source. All child processes exited.
The next architectural investigation should examine compiler-produced invocation and intermediate
output allocation while preserving the shared renderer and task issuance semantics. Further small
escaping guards or already-tested byte-bound substitutions have lower priority after these results.
