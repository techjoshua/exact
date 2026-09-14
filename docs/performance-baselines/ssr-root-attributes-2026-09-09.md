# SSR root attribute audit, September 9, 2026

Status: design discussion. No compiler/runtime change or new performance result accompanies this audit.

The root attribute object is created for the first intrinsic of each server render program, including
separately compiled list items and fragments. It is not confined to the application's document root.
`appendRenderProgramElement` always selects `rootAttributesSlot` for a server program's empty path;
nested intrinsic attributes instead use `appendRenderProgramAttributes` and individual compiled slots.

The runtime consumes semantic-target contribution layers before writing the root's attributes.
Without an unconsumed layer, it uses the compiler's static prefix and closed attribute plan, reading
values from the already-created object. With a layer, it constructs effective props and performs the
existing class, style, token-list, precedence, and override merges before generic serialization.
The object therefore supports a real framework behavior, but its unconditional construction is an
implementation choice. Unknown spreads also require runtime processing of authored property sets.

## Candidate direction for discussion

Reuse individual compiled attribute slots for closed roots. Evaluate authored expressions in their
existing source order during issuance, then use the captured values during ordered serialization.
At the root-writing boundary, use those values directly if no target contribution is pending.
Materialize composition inputs only when an actual target layer or dynamic property shape needs them.
This would preserve one rendering engine and the existing target behavior.

Static attributes need compiler-retained raw values for a composition fallback. The current static
plan contains serialized HTML plus key lists; parsing that HTML back into props would be incorrect.
A fallback must also preserve attribute order, class/style/token merges, TargetOverrides precedence,
once-only layer consumption, pending task ordering, rollback, and the new safe-class proof. Dynamic
spreads must not be silently treated as compiler-known property sets or evaluated again later.

This differs from the rejected flat-invocation experiment: that experiment replaced an eager-value
array with object fields while retaining the root attribute bag. The proposed direction removes an
existing redundant root representation using an attribute path that already exists for nested hosts.
No speedup is established until it is implemented and measured. The user requested this discussion
before further experiments, so the current retained implementation remains unchanged.

## Follow-up experiment

After the design discussion, an isolated scalar-root prototype removed the two frequently executed
root objects with one dynamic class value each. It retained shared raw static properties and
reconstructed the object only for active target composition. See
[the scalar-root experiment](scalar-root-2026-09-09.md) for paired results, correctness probes, and
remaining adoption requirements. The prototype improves all four large-workload medians but has a
small Bun string regression on the small workload. Production compiler/runtime code is unchanged.

The subsequent [compiler implementation and validation](scalar-current-2026-09-09.md) now retains
this optimization for closed roots with one dynamic value and otherwise static string properties.
That report supersedes the prototype's adoption status and includes rebuilt comparisons with React.

## Source boundaries

- `native/typescript-go/overlay/internal/exactcompiler/jsx_render_program_lowering.go`: root versus nested intrinsic lowering.
- `native/typescript-go/overlay/internal/exactcompiler/jsx_render_program_build.go`: root attribute slot ownership.
- `packages/ssr/src/render/render-program-attributes.ts`: closed plan and composition dispatch.
- `packages/ssr/src/render/receipt-target-contributions.ts`: merge and consumption semantics.
