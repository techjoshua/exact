# Compact hydration and progressive publication

## Status

Implemented after
[`compiler-owned-render-programs.md`](compiler-owned-render-programs.md) and
[`bounded-deterministic-async-ssr.md`](bounded-deterministic-async-ssr.md). This proposal implements
the accepted hydration/progressive experiment in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md). It must land
before lazy interaction islands, resumption, final adapter parity, or an optional structural refresh
extension depends on the compact table and shared bootstrap.

The grouped table, private compiler-finite boundary proof, compact coordinate, bootstrap
validation, deferred island lookup without dormant prop shells, row-local corruption confinement,
opaque-spread and independent-publication fallback, compiled adoption, and one-helper progressive
inline encoder are implemented. Compact interaction boundaries participate in event discovery,
their shared table is released after the final activation, and root hydration atomically claims the
deterministically named progressive helper. The format travels through the common hydration and
stream options used by every server/build adapter.

## Decision

Compiler-finite client boundaries use one versioned hydration table grouped by component contract
and prop schema. Each boundary carries only a compact table coordinate; the current self-describing
attributes remain the fallback for open-ended spreads, compatibility-owned values, malformed or
unknown records, and independently emitted fragments that cannot reference the response table.

Progressive inline mode installs one response-local replacement helper and emits ordered calls for
reveals. Inert mode keeps non-executable template records and uses the same versioned replacement
payload. Neither format becomes public application protocol.

## Hydration table

The initial internal JSON shape is equivalent to:

```ts
type HydrationTableV1 = readonly [
	version: 1,
	groups: readonly (readonly [
		componentName: string,
		propNames: readonly string[],
		rows: readonly (readonly [boundaryId: string, ...values: unknown[]])[]
	])[]
];
```

The compiler supplies the finite, canonical prop order. Rows contain encoded reactive protocol
values and server-slot references exactly once. A boundary coordinate such as `0.12` selects one
group and row; it is local to the containing hydration table and never serves as deployment,
component, operation, or patch identity.

Build key, execution root, component authorization, continuation/resumption data, public contexts,
plugin fingerprint, and endpoint configuration remain in the existing root hydration payload.
That existing metadata uses canonical compact defaults: schema-defined empty arrays and objects are
omitted during serialization and restored as shared immutable empty values during hydration.
Authored state, props, and context values are never compacted by this rule. A generated client
registration is the sole continuation-contract source when server hydration explicitly selects it,
preventing the same contracts from appearing in both HTML and client code.
The table may be embedded in that script or referenced by one sibling script, whichever wins
raw/gzip/Brotli and parse measurements without weakening CSP or document streaming.

## Validation and isolation

The client validates table version, depth, nodes, bytes, group/row counts, component registry name,
finite prop schema, row arity, reactive envelopes, boundary containment, build identity, and server
slot ownership before constructing props. Validation never invokes accessors or trusts a coordinate
outside its containing root.

Malformed rows fail independently. An eager malformed boundary uses its self-describing fallback
when present or mounts with the existing missing/invalid-props behavior; it does not invalidate
unrelated rows. Lazy activation retains only the validated row and table owner, not a copied props
object for every dormant boundary. Table ownership is released when its root hydrates, is replaced,
or is disposed and no dormant rows remain.

## Compiled adoption

Boundary discovery and prop lookup feed the compiled cursor from
[`compiler-owned-render-programs.md`](compiler-owned-render-programs.md). Matching regions avoid a
generic full-tree adoption scan. Dirty inputs, selections, focus, scroll, early input/change/click,
server slots, nested islands, resumptions, and foreign execution roots retain their current
ownership and recovery rules.

`data-exact-id` and comment ranges remain only where patches, lists, server ranges, inspection,
unplanned descendants, or structural ownership need direct identity. A compiler path may replace
redundant host IDs only after SSR, hydration, refresh, DevTools, and mismatch tests prove the node is
otherwise reconstructable.

## Progressive helper

Inline mode emits one nonce-bearing helper before its first replacement call. The helper:

- confines lookup to the configured progressive root;
- refuses a root already marked hydrated;
- replaces a matching element or exact comment range;
- parses replacement HTML through an inert template;
- leaves missing or malformed targets untouched; and
- exposes no stable global application API.

Subsequent calls carry only escaped boundary identity and HTML. The helper name is build-local and
collision-resistant. Calls and helper use the configured nonce. If policy forbids inline execution,
`progressiveMode: 'inert'` emits bounded template payloads for the approved external runtime.
Hydration claims the root, ignores later calls, and releases any helper-owned pending records.

For a stream known to contain only one reveal, an adapter may retain the current standalone script
when it is smaller. The choice is deterministic per response and covered by both compressed and
uncompressed byte measurements.

## Implementation order

1. Emit finite component prop schemas and grouped row data beside the existing representation.
2. Parse, validate, and resolve coordinates with row-local fallback and explicit table ownership.
3. Integrate eager islands, nested islands, partition slots, resumptions, and compiled adoption.
4. Integrate dormant interaction islands without per-boundary props copies.
5. Add the one-per-response progressive helper and ordered call encoder.
6. Transfer ownership atomically when hydration claims a progressive root.
7. Remove redundant attributes/markers only after differential and corruption tests prove them
   reconstructable; retain fallback records where independent publication requires them.
8. Project the format through every server/build adapter and microfrontend scope.

## Verification

- Byte tests record raw, gzip, and Brotli sizes for 1, 2, 8, 32, and 200 boundaries/reveals with
  small, large, repeated, and unique props.
- Parser tests cover malformed table/group/row/coordinate data, excessive budgets, unknown
  versions/components, wrong arity, invalid envelopes, and isolated recovery.
- Browser tests cover eager/lazy activation, early interaction replay, dirty controls, nested
  islands, server slots, resumptions, form state, focus, and compiled mismatch fallback.
- Progressive tests cover element/range replacement, nonce, inert mode, missing targets, root
  confinement, hydration races, cancellation, and helper cleanup.
- Adapter and CSP tests cover document/non-document streams, compression headers, external runtime
  mode, caching, and microfrontend root isolation.

For the accepted 200-boundary workload, framework cost excludes application-owned component names,
boundary identities, prop schemas, and values. The August 6, 2026 production-path run reduced the
framework-owned raw envelope from 18,866 to 5,204 bytes. Generated coordinates are framework cost,
so the isolated envelope grew from 204 to 542 gzip bytes and 92 to 342 Brotli bytes; compressed
category sizes are not additive. Indexed parsing was 25.6% faster. The whole response fell from
45,469 to 12,902 raw bytes and from 1,194 to 1,130 Brotli bytes, while gzip grew by 37 bytes. The
32-reveal shared helper reduced raw output from 19,692 to 3,010 bytes, gzip from 661 to 624, and
Brotli from 448 to 445, while median execution improved from 12.25 to 10.56 ms.

## Acceptance criteria

1. Finite boundaries decode to the same props and server-slot ownership as self-describing output.
2. Malformed records fail locally and never broaden hydration or patch authority.
3. Dormant boundaries do not replace transferred-code savings with copied runtime shells.
4. Progressive publication installs at most one helper and never mutates a hydrated/foreign root.
5. Current self-describing and generic-adoption paths remain explicit fallbacks.
6. Raw, gzip, Brotli, parse, activation, heap, and early-interaction metrics all satisfy the
   measured gates.
