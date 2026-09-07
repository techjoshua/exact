# Runtime object shape audit, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Followup: the [interleaved experiments](runtime-object-shape-experiments-2026-09-06.md) retained
mounted-record field ordering and rejected both render-program normalization variants.

This is a diagnostic source and snapshot review, not a measured optimization. No production runtime
or compiler changes were made for this audit. A fresh Chromium page loaded the controlled incident,
waited for live-service readiness, completed the authoritative claim, and collected garbage before
capturing a snapshot. One page per participant was inspected; these are not timing distributions or
causal before/after results.

The shape inventory follows each object node's internal `map` edge and counts distinct map identities
within runtime families recognized by their property edges. Property edges are not a complete
`Reflect.ownKeys()` inventory: V8 representation details and primitive values can affect which edges
appear. Identical visible property lists need not imply identical layouts, property representations,
or prototypes. Family identification is heuristic and does not attribute every V8 shape to eXact.

| Recognized eXact family    | Live objects | Distinct V8 maps |
| -------------------------- | -----------: | ---------------: |
| Effect scopes              |           35 |                1 |
| Dependency records         |           41 |                1 |
| Mounted records            |           29 |                6 |
| Render-program state       |           16 |                7 |
| Render-program child slots |           15 |                3 |

The complete shape-node category is 167,436 bytes for eXact and 152,300 bytes for React in this
inspection, matching the earlier category capture. This 15,136-byte difference is separate from the
much larger code-node difference. Shape normalization might also improve access-site optimization,
but that requires CPU evidence; these snapshot counts do not establish inline-cache behavior.

## Prioritized candidates

1. **Render-program state initialization.**
   `packages/dom/src/renderer/render-program-bindings.ts` assigns `refresh`, `directChildUpdates`, and
   `componentReceipts` during binding; child adoption and property binding add other fields along
   different paths. Seven observed maps across sixteen records make this the strongest candidate.
   Test canonical initialization of the fields already installed on bound programs, retaining lazy
   arrays and maps. Keep static programs minimal. Compare a small number of stable feature layouts
   before considering one wide record or an additional allocated sidecar.

2. **Mounted component field order.**
   `mounting/native-component-artifact.ts` initially omits `end`; `adoption/component-receipt.ts`
   puts it between `dom` and `scope`. The snapshot includes six component records with `end` last
   and one with `end` immediately after `dom`, otherwise exposing the same fields. Unify creation
   order for equivalent lifecycle paths. Test whether one small shared initializer actually shares
   maps; adding every optional `Mounted` field would impose a per-node memory cost and is not the
   proposed change.

3. **Child-slot value storage.**
   `render-program-children.ts` creates `{ parent, before, children }`, then adds `value` or
   `componentValue`. The snapshot contains eight general-value slots, six component-value slots,
   and one bare slot. Compare two deliberate initialized variants with a common five-field variant.
   Preserve the existing distinction between component identity and normalized child arrays.
   This is a smaller candidate and extra fields may cost more than the saved descriptors.

4. **Private receipt metadata.**
   `packages/core/src/component-abi` conditionally spreads `key`, `domain`, and enhancement metadata
   into private records. Some variants are useful capability specialization. First measure their
   actual population in receipt-heavy pages; then compare stable per-kind layouts and consistent
   property order. Preserve opaque branding, frozen metadata, absent-field semantics, and public
   prop enumeration. Do not normalize arbitrary authored props or component state with dummy keys.

5. **SSR copy-and-delete paths.**
   `createPreparedServerComponentReference()` in `component-abi/receipt.ts` copies props and deletes
   `key` and `__exactEnhancements`. Compare an omission copy on the branch that needs it, preserving
   the existing no-copy common path and observable property access semantics. This is a server CPU
   and allocation candidate; it cannot explain browser retained heap. The style reset in
   `renderer/target-contributions.ts` is another lower-priority dictionary-transition candidate.

## Preserve existing strengths

Effect scopes already declare stable fields while lazily allocating their collections. All 35
observed scopes share one map. All 41 observed dependency records also share one map after attaching
subscribers. Neither family is a demonstrated source of shape proliferation in this workload.
Private tuple operands already avoid many named-property layout decisions.

For each candidate, retain frozen baseline/candidate artifacts and compare the same lifecycle stages:
hydration, first interaction, navigation, and disposal. Count actual map identities, shape-node bytes,
object self-bytes, and code-node bytes separately. Use focused interleaved timing for startup and
updates. Reduced map count alone does not establish reduced total memory or faster execution.

V8 explains the relationship between insertion order, hidden classes, descriptors, and dictionary
properties in [Fast properties](https://v8.dev/blog/fast-properties) and
[Maps / hidden classes](https://v8.dev/docs/hidden-classes). These inform the hypotheses; the repository
snapshot and source paths above establish the concrete candidates.
