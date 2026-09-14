# Projector ancestor-stack experiment, September 9, 2026

Status: not adopted. The current implementation retains the native Set guarantee for version-one
positional projectors. No production API, ABI, or runtime behavior changed in this experiment.

## Hypothesis and contract audit

Hydration validation already uses a compact ancestor stack for shallow generic traversal. Before
entering a generated projector for repeated records, it explicitly converts that stack to a native
Set. Generated projectors themselves only call has, add, and delete. Avoiding forced conversion
might reduce repeated hash operations and allocation, with a hypothesized 2-6% large-workload gain.

The bundle-only prototype removes exactly that one forced conversion. It retains the separate
depth-based promotions to Set and all field, shape, node-budget, and cycle checks. It does not modify
the generated projectors, serialize different values, or cache request data.

The code audit also confirms that PositionalProjectionContext.active is explicitly typed as
Set<object>, engineering documentation promises that contract, and a focused test invokes
Set.prototype.has.call on the supplied value. Keeping a lightweight stack therefore violates the
current internal contract even though the compiler's generated functions only need three methods.
Adoption would require an explicit initial-contract redesign and appropriate migration/validation,
not silently removing that test or assuming the type is irrelevant.

## Paired results

Twenty-four fresh sequential production processes compare the retained document-tail bundle with
the prototype on Node/Bun, string/stream, and 96 incidents. Three alternating-order pairs per
combination use 5,000 warmups and 12,000 measured renders. Both runtimes load the same portable bundle.
Streams are fully consumed via Response.text. Every population checks complete-document framing
and final full-response SHA-256 against its eXact control. Asset tags are empty.

Median microseconds per complete render, lower is better. Positive paired change means slower;
this is the median of per-round changes, not a ratio of independent medians.

| Runtime | Mode   | Control us | Candidate us | Paired change |
| ------- | ------ | ---------: | -----------: | ------------: |
| node    | string |     161.63 |       153.57 |         -5.2% |
| node    | stream |     197.55 |       193.00 |         -2.3% |
| bun     | string |     250.34 |       245.34 |         -2.2% |
| bun     | stream |     298.76 |       301.55 |         +3.1% |

Node strings improve in all three pairs. Bun strings improve in two of three, while Bun streams
regress in two of three with a median paired regression of approximately 3%. Node streams are mixed.
Shared-PC interference remains possible; these short runs do not establish confidence intervals.

The current prototype is not adopted: it weakens an explicit contract and introduces an unfavorable
Bun streaming tradeoff while that workload still trails React. No arbitrary minimum improvement
percentage was used. A future narrower ancestor capability remains a possible design choice, but
these results do not justify adopting this implementation as a universal improvement.

## Evidence and next action

All response hashes match. That demonstrates output parity for this fixture, not full ABI or cycle
correctness. No production tests were rerun for the discarded prototype; the existing native-Set
test would intentionally reject it. React was not timed in this experiment, and no HTTP/browser
performance or new React-relative result is claimed.

The accompanying JSON and ZIP preserve each population, artifact hashes, retained/prototype
bundles, builder, runner, fixed input, and audited runtime/compiler/test/documentation sources.
All timing child processes exited. The next investigation should target allocation and repeated
work inside generated hydration projectors while preserving the ancestor contract, rather than
repeating this unqualified conversion removal.
