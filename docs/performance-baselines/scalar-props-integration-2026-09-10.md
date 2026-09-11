# Scalar prop proof integration, September 10, 2026

Status: guarded source implementation, canonical builds, and browser validation complete.
Retained after guarded measurements and longer small-document confirmation. The preceding artifact experiments are recorded
in [scalar prop proofs](scalar-props-proof-2026-09-10.md); their numbers do not measure this
guarded implementation.

## Compiler and runtime contract

The native compiler recognizes fresh empty or single-field object-literal prop bags for directly
selected children. Spreads, computed keys, methods/accessors, larger bags, and reserved prototype,
key, or enhancement fields do not receive the proof. Generated reference issuance carries the
field name (null for empty) and the prepared program invocation. It does not trust TypeScript
scalar annotations or evaluate a field predicate before the reuse guard.

The SSR runtime records an issuance attempt on the prepared program invocation, then checks the
actual value once. Only null or a value that is neither an object nor a function qualifies. The
proof stays on the component reference, outside authored props. Synchronous execution consumes
it once and requires the same current prop bag. Normalization, children handling that copies
props, reused references, and repeated visits to the prepared program retain ordinary preparation.
Recording failed proof attempts prevents a later invocation from trusting an already-exposed bag.

Inherited reserved key/enhancement metadata disables proof issuance before reference creation,
because those accesses could run authored code and expose the otherwise private bag. Even that
failed attempt is recorded. Registered symbols share both proof consumption and attempted issuance
across separately loaded SSR copies. A regression test loads a second module instance and verifies
that it consumes the first copy's proof without allowing a second attempt. The ordinary dependency source, settlement, cancellation, and failure
paths remain available. Scheduled components continue ordinary preparation.

The additional optional server-operation arguments are an internal optimization hint. Existing
artifacts omit them and retain ordinary preparation. Earlier runtimes ignore the extra arguments
and preserve behavior. The writer call signature, serialized hydration representation, package
versions, and ABI epoch are unchanged. Frozen fixtures were not regenerated.

## Validation

- Native compiler tests and executable build pass, including fresh-bag selection and rejection
  of spread, multiple-field, and reserved-key cases.
- SSR TypeScript build and test typechecking pass for the field-name contract.
- 345 SSR tests across 54 files passed after compiler integration. After adding the inherited
  metadata guard, all 17 focused proof, static-program, and writer tests passed.
- Proof tests cover identity, replacement, reference isolation, repeated attempts after scalar
  and non-scalar input, and no getter read during a repeated attempt.
- The compiled-ABI check passes its frozen 0.5.0 client, SSR, hydration, keyed identity, task,
  and disposal coverage.
- The final isolated application builds successfully and contains exactly the two expected
  SeverityBadge field-name proof sites. Native executable and compiler source are synchronized.

The initial compiler test run exposed a nil-reader assumption in a synthetic plan fixture.
The proof selector now declines missing readers. An earlier intermediate build used a boolean
predicate; it was replaced by the field-name form to avoid repeated getter reads before the
invocation reuse guard. Those intermediate forms are not the current implementation.

## Guarded implementation follow-up

[Guarded measurements](scalar-props-guarded-2026-09-10.md) records the full 72-population
matrix and the longer small Bun streaming confirmation. Those captures used private symbols;
the final source uses registered symbols to preserve correctness across runtime copies.

The registered-symbol build passes TypeScript compilation, test typechecking, all 350
SSR/compiler tests across 55 files, 56 browser checks across Node/Bun string/stream, platform
boundaries, and package-content checks. Canonical comparison applications were rebuilt from
that emitted runtime. Final HTTP and focused measurements are recorded in the guarded report. The optimization is
retained for repeatable large-tree improvements; HTTP results are mixed and the longer small-case
confirmation is approximately neutral. Targeted ESLint and final frozen-ABI checks also pass.

The earlier isolated artifact, source snapshots, native and runtime logs, and ABI evidence
remain in scalar-props-integration-2026-09-10-evidence.zip. Subsequent measurements must not be
attributed to that older artifact. The overall performance objective remains unmet.
