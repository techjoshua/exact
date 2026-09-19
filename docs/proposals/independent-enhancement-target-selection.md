# Independent enhancement target selection

## Status and purpose

**Implemented for ABI epoch 2; broader performance acceptance remains open.** The
[before/after comparison](../enhancement-performance-comparison.md) records the initial regressions,
runtime optimizations, repeated measurements, and remaining performance questions.
See the [implementation and validation report](../enhancement-target-prototype.md)
for runtime ownership, compiler changes, cross-renderer and Intl acceptance, package migration,
reproducible measurements, and measurement limits. The specification and delivery sequence below
record the design that guided implementation; they are not an outstanding implementation checklist.
Public capability exports and receipt-to-instance lookup remain deliberately deferred.

Receiving components remain unaware of incoming enhancements at build time. Runtime selection,
including a default enhancement, determines whether the selected fragment receives additional
`_target` props and therefore needs a host. Unenhanced fragments and scalar Text targets do not
become spans. The implementation does not add hosts to every potential receiving component.

Resolve an enhancement target once through compiler-managed bindings, then supply it as the
enhancement component's child. `_target` places that supplied target with an owned layer of props;
it does not discover or export a target. Separate this from local ref observation.
Preserve ordinary component authoring, precise updates,
cross-renderer agreement, and deterministic ownership. Do not introduce an enhancement-only
component kind or an invocation-mode check.

The current contract remains documented in [component language](../component-language.md).
The redesign is a versioned migration from the epoch-1 behavior described below.

## Historical evidence and problem

Commit `1124dad6` introduced general semantic target forwarding. Published 0.5.0 baseline
`6476a2f5` already resolves exported `_target` boundaries ahead of namespace-specific roots.
This is released behavior, not an unreleased implementation detail.

At the start of this migration, ownership was distributed across:

- [Enhancement selection](../../packages/dom/src/renderer/enhancement-targets.ts): exported targets
  precede the bounded frame's explicit enhancement selector.
- [Target routing](../../packages/dom/src/renderer/target-routing.ts) and
  [contributions](../../packages/dom/src/renderer/target-contributions.ts): boundaries select child
  targets, own property layers, and track structural dependencies.
- [Component roots](../../packages/dom/src/renderer/component-roots.ts): exported targets also
  precede first-host selection for root refs, including propagation through nested components.
- [Enhancement lifecycle](../../packages/dom/src/renderer/enhancements.ts): selector watches traverse
  logical output; reconciliation can scan and rebuild a declaration subtree.
- [SSR enhancement operations](../../packages/ssr/src/render/operation-enhancements.ts): request-local
  routing and output capture handle structural wrappers. These are not simply DOM traversal on the server.

A field may contribute accessibility attributes to an input while an incoming motion enhancement
needs to animate its surrounding label and help text. One global exported target cannot express both
intentions. Merely changing precedence leaves root refs, nested forwarding, and attachment lifecycle
coupled. Restricting `_target` to enhancement definitions would conflict with reusable ordinary
components and would not solve the ownership distinction.

## Recommended contract

The rules below are the proposed acceptance contract. The decisions and acceptance matrix in this
document resolve the authoring questions; prototypes must establish feasibility before production
implementation. A failed prototype requires an explicit design revision, not silent behavior changes.

### Incoming enhancement selection

1. An enhancement authored on an intrinsic targets that intrinsic. Descendant selectors cannot
   redirect it. Direct `_` enhancements select the fragment range; the conditional intrinsic
   wrapping rule below applies only when the enhancement contributes additional `_target` props.
2. An enhancement authored on a component resolves its matching active `namespace:root` within
   that invocation's permitted logical output scope.
3. For intrinsic fallback, follow the bounded path to the first intrinsic and stop there; do not
   descend to its deepest child. This fallback must not replace an explicitly selected fragment or
   text target. Text-only output resolves to its owned text/range target when no intrinsic exists;
   valid intl targets are not absent merely because they are not Elements.
4. A `_target` boundary does not export a universal override for incoming enhancements.
5. Selection is per canonical enhancement identity, not the import alias string. Finite activator
   mappings must retain their namespace grouping and deduplication semantics.

Retain bounded component ownership. Bind explicit candidates in the receiving component's own
output frame, including its owned intrinsic structure and transparent control-flow ranges. Do not
search arbitrary nested component implementations or later unrelated component frames. If an
explicit selector identifies a nested component invocation, resolve that component through its own
scope for the same enhancement. Fallback may follow the first root-bearing nested component path.

Projected children retain their original ownership. A component returning only its supplied children
delegates selection through that supplied range. A component adding structure owns a new frame:
only its own markers and explicitly marked child invocations are explicit candidates. Fallback follows
the first root-bearing path and does not inspect unrelated component siblings for their markers.
Use compiler ownership facts rather than physical DOM ancestry.

Recommended ambiguity rules: diagnose multiple simultaneously active matching roots in one selection
scope; permit mutually exclusive branches. A false selector is inactive. An active selector whose
selected component currently produces no supported target keeps its route dormant rather than enhancing
an unrelated fallback. Becoming inactive permits fallback. Specify the same results for compiler
diagnostics where provable and runtime diagnostics where dynamic.

### Compiler-managed target bindings

A component declaring `motion:root` can provide its active motion target through compiler-managed
metadata and a runtime binding. Resolve canonical enhancement identities at compilation rather than
looking up authored namespace strings at runtime. Preserve finite activator grouping and aliases.

The preferred prototype gives static roots direct bindings and updates dynamic candidates only when
their selector eligibility or structural generation changes. A binding identifies an owned render
target and generation, not just an Element or application ref. It must represent intrinsic, text,
and fragment/range targets where supported, and work before a browser DOM exists. Distinguish a
binding's existence, eligibility, readiness, and selected target kind. Empty output is not the same
as an empty Text node or a live empty fragment boundary.

An incoming enhancement obtains its matching binding, or the defined bounded fallback, and receives
the resolved target as its child. Explicitly selected nested components may delegate through bounded
bindings; do not construct a public descendant graph. Establish availability and cycle handling
without executing components twice or allowing generated wrappers to redirect original bindings.

Reuse the child-receipt infrastructure for opaque identity, ownership, and target preservation where
appropriate. Public `partitionChildren` and `childrenOf` still describe authored children; they are
not the runtime target resolver. Do not allocate partition arrays to place an already resolved target.
`withChildren` replaces intrinsic contents and does not implement owned prop contributions.

### Supplied-target placement, contributions, and local refs

The corrected model is `_target = props.children`, where the enhancement receives one logical target.
Rendering `props.children` places it unchanged; `_target` places it with independently owned props.
A logical target may own one Text node or a fragment range with zero, one, or several physical nodes.
Do not equate the single-target contract with exactly one Element or exactly one DOM node.

When the component is invoked normally, the caller supplies its child. The component need not detect
enhancement invocation. The exact cardinality and placement rules are specified below. Do not clone
or mount the same owned target twice, or recover by a descendant search inside `_target`.

The selected syntax is `<_target className="contribution" />`, implicitly consuming the supplied
child. Migrate today's explicit `_target` children to that form under the revised artifact contract.
Do not introduce `enhancement="motion"` or `_target motion:root` as an additional lookup mechanism;
existing namespace markers select destinations on authored output, independently of placement.

Preserve authored binding precedence, token/class/style merging, interaction ownership, ref fan-out,
and per-owner cleanup. Fragment targets receive additional props through the intrinsic wrapping rule
below, not by applying Element APIs to their Text nodes or by promoting props to a parent element.

### Conditional intrinsic wrapping of fragment targets

Automatically and silently wrap a fragment in an intrinsic element if, and only if, the fragment is
the resolved root of an enhancement and that enhancement contributes additional props or attributes
through `_target`. Default to `span`. The wrapper contains the entire fragment, including a fragment
whose visible output is a single Text node, and receives the contributions.

- A fragment with no additional `_target` props stays transparent.
- An existing intrinsic receives contributions directly, without another wrapper.
- Ordinary fragments are unaffected. This is not a general conversion of Text nodes to elements.
- Preserve the fragment's child identity and ownership. Keep the wrapper stable as contributed
  values change, including temporarily undefined values; do not wrap and unwrap on each prop update.
- Do not infer developer intent from the parent element, visibility, or whether literal markup is
  useful. Do not add an adaptation opt-in, usage-specific rejection, or parent-prop promotion.
  Framework tests establish rendering, escaping, lifecycle, and hydration correctness rather than
  judging application use cases.

Allow a usage-site override through reserved namespace configuration:

```tsx
<_ motion:fade motion:intrinsicFragment="span">
	{message}
</_>
```

`namespace:intrinsicFragment` selects the tag for this wrapping rule. It is framework configuration,
not a DOM attribute, enhancement activation, or a reason to wrap without additional `_target` props.
Resolve it through the same canonical namespace metadata as other enhancement configuration.

Coalesce consecutive wrapper-requiring enhancements that request the same tag, including the default
`span`. Different tags nest in source order, first authored outermost. Do not merge equal tags across
an intervening different-tag wrapper. Each enhancement retains its own instance, contributions,
events, refs, and cleanup even when it shares a host. The context-ordering rule below preserves this
nesting without silently changing source order.

The contribution-presence, spread, lifetime, and tag rules below preserve the exact trigger above;
they do not create a broader target-adaptation policy.

Define local root-ref behavior separately, including typed observation of Text and ranges. Existing
Element-oriented consumers must retain appropriate narrowing. Refs must not export an incoming
enhancement destination or infer one from unrelated nested contribution boundaries. Preserve useful
root lifecycle observation through an explicit, documented rule, not invocation-mode checks.

### Enhancement composition and lifecycle

Keep separate identities for the authored declaration, selected intrinsic, text, or fragment, contribution
owner, enhancement instance, and target generation. Store them within existing renderer ownership;
do not create a second public component tree.

- Peer enhancements applied to one authored target retain that target regardless of the wrappers
  other peers install. Preserve context dependency ordering and same-target deduplication.
- An enhancement explicitly applied to a component that also implements an enhancement resolves
  against that component's authored output. It may select its wrapper independently of its input.
- Framework-inserted wrapper chains do not become candidates for the original declaration's search.
  Explicitly authored declarations inside those components remain active in their own scopes.
- A selector update that resolves to the same target preserves instances, subscriptions, refs,
  tasks, and motion state. It must not trigger release and reattachment.
- A changed target generation releases the old attachment and fences stale asynchronous work before
  publishing the replacement. Replace the affected enhancement instance rather than retargeting one
  durable instance. Preserve unrelated peers and the authored target when its identity is unchanged.
- Cancellation, conditional disappearance, keyed replacement, Activity parking, Suspense candidates,
  portals, unavailability, and unmount must release only their own resources.

## Settled authoring and ownership decisions

### Placement and contribution presence

- `_target` is self-closing and implicitly places the supplied child. Explicit children are rejected
  in the revised syntax; repository callers migrate together. A normal component invocation may
  supply one intrinsic, component receipt, scalar, or explicit fragment. Multiple independently
  supplied children require an explicit fragment. An empty supplied value places nothing and creates
  no host; an explicit empty fragment is a live target and can receive a wrapper.
- Resolve a supplied component receipt through the bounded binding contract at handoff. `_target`
  consumes that result; it never executes or traverses the component again. A plain text child in
  an ordinary invocation remains plain text; automatic host creation requires an enhancement's
  fragment root, not merely a scalar child.
- At most one active placement of a supplied target is allowed per owner. Mutually exclusive
  branches are valid. Rendering both `props.children` and `_target`, or two active `_target` sites,
  must not duplicate the target. Report statically provable duplication at compilation and dynamic
  duplication before committing the second placement.
- Explicit host props, including class/style, events, and `ref`, count as contributions even when
  their values are undefined. `key`, placement metadata, and reserved namespace configuration do
  not count. A ref therefore observes the generated host when it triggers fragment wrapping.
- Finite spreads use compiler-known host keys. An open spread counts once an own host-prop key is
  present, regardless of its value; an empty spread alone does not trigger wrapping. Once triggered,
  retain that owner's wrapper requirement for the active attachment lifetime. Later removal of keys
  releases their contributions but does not repeatedly remove and recreate the host. The first key
  appearing later is a structural transition, not an ordinary scalar update.
- `namespace:intrinsicFragment` is a compile-time constant tag string in this version. It does not
  activate an enhancement, contribute a host prop, or create a wrapper by itself. Dynamic tag changes
  are deferred. This restriction controls host identity, not developer intent or HTML suitability.

### Coalescing, order, and cleanup

Source order means the authored order of distinct enhancement activators at one declaration, after
canonical alias deduplication. For an implicit default activator, use its first activating prop.
Compile-only root and wrapper configuration do not determine activation order. Preserve declaration
ordering through artifacts rather than sorting identities alphabetically.

Coalesce only adjacent compatible wrapper owners on the same fragment. An enhancement with its own
structural output is a barrier: do not move a shared host across that output. Compiler-proven
pass-through peers need no extra host. Different declarations are not globally coalesced merely
because they happen to resolve to the same tag; preserve their existing lexical ownership order.

Context providers must precede dependent consumers in the declared chain. Independent peers follow
source order. If required provider/consumer ordering contradicts that nesting, report the conflict
and its participants instead of reordering wrappers or inventing cross-sibling context visibility.
Validate this against motion/physics/gesture consumers in the prototype; if ordinary supported
combinations cannot satisfy it, revise the design explicitly before implementation.

Shared hosts retain separate contribution records. Existing authored props keep their precedence;
otherwise the nearest inner contributor wins singular-prop conflicts. Preserve the existing class,
style, token-list, event, and ref composition contracts. Refs for sharing contributors see the same
host; removing one owner releases only that owner's ref, handlers, and contribution values.

Retain a shared host while any surviving owner requires it. When the final requirement ends, unwrap
the fragment while retaining its children. Coalescing is performed on attachment; do not rebuild
surviving wrappers solely to compact groups after removal. Host topology changes publish root release
and introduction generations to affected observers, but do not remount unchanged authored children
or unrelated enhancement instances. Test first-time open-spread wrapping as well as removal.

### Refs and target capabilities

For a component with an active `_target`, its local root lifecycle observes that supplied target's
presentation: the intrinsic, its generated wrapper, or its transparent Text/range presentation.
An explicit `_target` ref observes the same presentation. Without `_target`, the component observes
its first host or text/range output; it does not inherit an unrelated descendant's contribution
target. A component needing its own surrounding wrapper uses a separate explicit ref.

Keep existing Element-oriented APIs typed as Element-oriented. A Text or multi-node range must never
be passed as a fake Element. The prototype must establish a renderer-neutral internal target
descriptor and a compatible way for lifecycle consumers to distinguish target kinds. It must not
introduce a new public ref API merely to expose that descriptor. Input target identity remains
separate from presentation-host identity, so generated wrappers cannot redirect incoming bindings.

### Text-only serialization

In a text-only host such as `title` or `textarea`, materialized wrapper markup is serialized as host
text, not mounted as a live child Element and not promoted to the parent. Thus a contributed span
may intentionally produce literal `<span ...>...</span>` in the host's text. Client execution must
match the decoded result of SSR output, including correct text escaping. Existing textarea value
binding remains authoritative; do not overwrite a user's dirty value through child mutation.

Do not interpret hidden status or reject application intent. Because serialized markup has no live
wrapper node, it cannot fulfill an Element ref or install DOM listeners on that serialized span.
Do not fabricate such an attachment. The prototype must verify how the existing lifecycle publishes
this absence while preserving text generation. If it cannot do so coherently, record the limitation
and revise the contract before rollout, rather than silently mounting different client output.

## Acceptance matrix

Each row requires observable output, target/ref identity, and ownership assertions where applicable.
Compiler-backed fixtures should be shared across DOM, SSR, and hydration when their boundary allows.

| Case                                                    | Required outcome                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Intrinsic target plus `_target` class                   | Original intrinsic receives class; no wrapper.                                 |
| Fragment plus bare `_target`                            | Transparent output, including a single Text node or empty range.               |
| Fragment plus declared class with undefined value       | One stable span; later values update props without remounting.                 |
| Fragment plus ref or event contribution                 | One host; ref/listener belongs to its contributing owner.                      |
| Fragment plus wrapper configuration only                | No host solely because configuration exists.                                   |
| Open spread empty, then host key, then empty            | Transparent initially; one structural wrap; retain host until attachment ends. |
| Adjacent span/span/div/span requirements                | First pair shares; other hosts nest in source order; owners remain distinct.   |
| One shared owner removed                                | Host and children retained; only departing contributions released.             |
| Last host owner removed                                 | Children retained and unwrapped; host observers released exactly once.         |
| Explicit root remains same after selector update        | No remount, new generation, or contribution reattachment.                      |
| Active explicit root produces no target                 | Dormant route; no unrelated fallback. Inactive selector permits fallback.      |
| Same namespace has two active roots                     | Deterministic diagnostic; no traversal-order winner.                           |
| Enhanced enhancement chooses its own wrapper            | Incoming binding independent of its supplied target and `_target` props.       |
| Required context ordering conflicts with source nesting | Explain conflict; never silently reorder.                                      |
| Intl locale/value update in transparent fragment        | Text/range retained when structure is unchanged; no introduced host.           |
| Intl fragment gains owned host contributions            | Exact wrapping rule, slot identity retained, no parent-prop promotion.         |
| Text-only host contains materialized markup             | Literal serialized text; SSR/client agreement; no fake Element attachment.     |
| Lazy replacement, cancellation, parking, or unmount     | Stale work fenced; only affected owners released; request isolation retained.  |

## Prototype deliverables and decision gates

Build a small vertical prototype before broad migration. It must demonstrate static and conditional
namespace bindings, supplied-target placement, same-tag shared hosts, one dynamic spread, and intl
Text/fragment cases through DOM, SSR streaming, and hydration. Include the text-only-host row above.
Instrument component execution counts, route resolutions, host creation, attachment generations,
and contribution cleanup. Compare with the current implementation and explicitly authored wrappers.

The prototype must prove that enhancement preparation can reveal contribution requirements before
committing affected output, without repeated component execution or reconstructing a general child
tree. Separate declaration preparation from DOM-ref publication and lifecycle activation. Establish
where buffering is required and measure it. Failure here blocks rollout and requires a documented
design revision; the implementation must not quietly add rerendering or change source semantics.

Before production work, produce a package/ABI impact table from actual compiler helpers and consumers:
core receipts and contracts, native/compiler artifacts, DOM, SSR, hydrate, testing, and affected intl,
accessibility, motion, gesture, and physics consumers. Classify changed artifact providers separately
from dependents that only need rebuild/testing. Advance the ABI epoch for incompatible semantics and
version the actual providers under release policy. Do not preselect every dependent for publication.

Capture repeated baseline samples, environment, fixture sizes, and variance, then record numerical
budgets before comparing the prototype. Include no-enhancement controls, direct intrinsics,
transparent intl fragments, contributed/coalesced fragments, and structural churn. Prototype/report
completion, rather than invented timing thresholds, is the remaining performance gate.

## Future needs the design must accommodate

Intl fragment and Text targets are mandatory acceptance consumers for this change, not deferred
extensions. The binding and placement design must support them from the first prototype.

| Need                                                                            | Required accommodation                                                                                                                | Not required in this change                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Accessibility, themes, motion, and gestures on different parts of one component | Independent namespace selection and contribution ownership, with no wrapper-order dependence.                                         | A public map of every internal element.                                      |
| Enhancements that add wrappers or are themselves enhanced                       | Distinguish peers on one target from declarations on an enhancement component's own output.                                           | Invocation-mode APIs or special component kinds.                             |
| Several contribution regions                                                    | Explicit refs and separately owned layers; deterministic unqualified-root behavior.                                                   | Named public target exports before real consumers establish their need.      |
| Lazy registries, asynchronous preparation, and distributed components           | Dormant routes, generation fencing, request isolation, and consistent placement boundaries.                                           | Executing client-only components on the server to inspect output.            |
| Motion timelines and shared elements                                            | Stable attachment generations and observable lifecycle transitions.                                                                   | Implementing timeline participation or shared-element matching here.         |
| DevTools and testing                                                            | Explain declaration, selector or fallback reason, selected target, and lifecycle without exposing private values or public build IDs. | A receipt-to-instance application API.                                       |
| SSR, hydration, and progressive output                                          | Equivalent selection and ownership, bounded buffering, and correct activation when a target was unavailable during SSR.               | A second render pass to discover targets.                                    |
| Child composition                                                               | `partitionChildren` can place supplied content into owned regions; `childrenOf` and `withChildren` preserve intrinsic composition.    | Using public child arrays as the renderer's target-discovery representation. |

Keep [scoped child participation](cooperative-structured-children.md) deferred. This routing work
does not establish a need for its capability API. Future finite, named forwarding contracts remain
possible, but reserve neither syntax nor a global registry for them now. Compiler-managed bindings
for already-declared namespace roots do not require a new public export API.

## Mandatory intl validation

Audit `@exactjs/intl`, `@exactjs/intl-analyzer`, and `@exactjs/intl-build`, compiler intl lowering,
and their DOM/SSR/hydration integrations. In particular, inspect
[intl components](../../packages/intl/src/components.ts), which use target receipts for locale and
property contributions, separately from message and formatter fragment rendering. Follow the
[internationalization contract](../internationalization.md) for lexical message ownership and opaque
component slots. Do not assume every intl activation has the same target kind.

Use compiler-backed fixtures and real renderers to validate:

- Direct `<_ intl:message>`, plural/select branches, and currency/unit/scalar fragments whose visible
  result is a Text node. Preserve wrapper-free output when no extra `_target` props are contributed,
  along with adjacent text boundaries and whitespace.
- Empty and nonempty text transitions, a live fragment with no visible content, and multi-node rich
  messages. Keep logical range identity distinct from its current physical first node.
- Locale/value updates and text-only updates without target reselection or enhancement remount.
  Assert Text node retention where structure is unchanged; allow only intentional structural
  replacement when branch or translated slot structure changes.
- Rich messages with movable intrinsic slots and opaque component fragments. Preserve lexical
  ownership, durable child instances, bindings, and exact-once placement across translation changes.
- Intrinsic content replacement, translated attributes such as placeholder/aria-label, and locale
  `lang`/`dir` contributions. Intrinsics receive props directly; enhanced fragment roots with extra
  `_target` props receive the default or overridden wrapper. Do not promote props to a parent.
- Exact wrapping-trigger coverage: unenhanced fragments, enhanced fragments without contributions,
  contributed fragment targets, and already-intrinsic targets. Verify default span, tag overrides,
  consecutive same-tag coalescing, mixed-tag source order, separately owned contributions, stable
  wrappers during reactive value changes, and retained child identity.
- Title and textarea contexts, including applications using a textarea to hold literal markup.
  Verify the specified serialization, escaping, client behavior, value-binding ownership, and
  hydration results. Do not silently reinterpret contributions as parent attributes or add an
  application-intent validation rule.
- Fragment enhancement unavailability and fallback, nested enhancements, cancellation, disposal,
  keyed reordering, and deferred branches, with no stale route or contribution ownership.
- SSR strings and streams, escaping, hydration of parser-coalesced text, range markers, adoption of
  existing nodes, and later locale updates. Validate semantic agreement without requiring identical
  physical text segmentation before and after HTML parsing.
- Analyzer extraction, durable message keys, catalog generation, opaque-slot metadata, and generated
  package artifacts. Target changes must not silently alter lexical extraction or localization IDs.

Benchmark repeated inline intl fragments and large translated messages as well as Element targets.
Record text update work, wrapper/marker counts, allocations, hydration, streaming latency, and
retained memory. Required gates include no wrappers outside the exact trigger, no redundant wrappers
for consecutive same-tag contributions, no Element-only target
assumptions, no dropped text, and no spurious same-target lifecycle changes. Add meaningful regression
coverage at the compiler/runtime boundaries; broad formatter unit tests alone are insufficient.

## Performance design and acceptance

Collect a baseline before implementation. Use both the current branch with child composition and
the published artifact fixtures for their distinct purposes: same-branch performance comparison
isolates routing changes; frozen fixtures establish compatibility. Do not attribute compiler receipt
costs from child composition to this change.

Preserve the direct-intrinsic fast path and optional runtime capabilities. Components without target
features must not allocate route records, install route watches, or include target-only helpers
solely because this feature exists. Check emitted artifacts and bundles as well as runtime timing.

For component routes, prototype compiler-managed target bindings first, with finite candidate metadata
and retained route records. Placement and contribution application consume the resolved target directly
and must not repeat discovery. Measure selection, placement, and prop updates separately.
Measure wrapper-free fragments and contributed fragments independently; compare coalesced wrappers
with equivalent explicitly authored hosts. Plan static grouping in the compiler where possible and
avoid DOM reconstruction when only contributed values change.
Create records only for participating declarations. Subscribe to relevant selector values and
structural generations; scalar updates unrelated to selection must not search or rebuild routes.
Deduplicate affected work during a transaction. Release dependency edges on retarget and teardown.
Use bounded traversal when dynamic structure requires it. Avoid whole-tree candidate indexes,
eager child flattening, and caches on every component without measured justification.

SSR must use the same selection policy without constructing a DOM-like tree, repeating component
execution, serializing private capabilities, or leaking across requests. Determine explicit selection
before committing affected output. Use static compiler facts where available and buffer only the
necessary unresolved region otherwise. Measure time to first byte and peak buffering, not just
completed rendering throughput. Hydration must reconstruct the same route and contribution owners.

Benchmark direct targets, shallow and deep forwarding, many independent namespaces, large sibling
sets, same-target selector changes, changed-target churn, conditional and lazy output, and nested
enhancement wrappers, plus the intl fragment/Text matrix above. Include an unenhanced application
control. Record mount/hydration time,
scalar/structural update work, SSR throughput and first-byte latency, allocations, retained heap
after churn, bundle size, and attachment counts.

Set numeric regression budgets from repeated baseline samples before judging results. Correctness
gates are absolute: zero spurious same-target remounts, no leaked attachment generations, no routing
work caused solely by unrelated scalar updates, and no execution of components for discovery twice.
Reject unexplained regressions beyond measured noise. Document justified tradeoffs explicitly;
do not claim that separating semantics necessarily improves speed.

## Delivery phases

### 1. Freeze the behavioral specification and baseline

- Audit all production `_target` and root-ref consumers, DOM/SSR/hydration paths, compiler lowering,
  testing renderers, and existing target tests. Separate current evidence from desired expectations.
- Build a behavior matrix for intrinsic and fragment declarations; explicit versus fallback roots;
  nested components and projection; multiple namespaces; contribution boundaries; local refs; peers;
  and an enhancement component that is itself enhanced.
- Encode the specified binding scope/readiness, empty selection, duplicate-root diagnostics,
  cardinality, placement syntax, wrapping/coalescing, local refs, and replacement lifetime in
  acceptance fixtures. Confirm the intl Text and fragment cases without inventing alternate behavior.
- Record baseline timing, allocation, route-work, and attachment counts with reproducible commands,
  environment, and artifact versions. Identify package and ABI owners.

Exit: the matrix above has executable fixtures, the baseline is recorded, and the package/ABI impact
table is complete. Any specification revision required by evidence is recorded explicitly.

### 2. Prototype the smallest compiler and renderer contract

- Keep pure selection policy separate from attachment mutation and contribution composition.
- Prototype compiler-managed bindings, logical frame boundaries, and structural invalidation using
  existing compiler artifacts and receipt identity. Retain optimized render programs. Demonstrate
  direct supplied-target placement, wrapper-free intl Text/fragments without contributions, and
  exact conditional wrapping with contributions before expanding.
- Prove nested enhancement independence and same-target stability before changing public behavior.
- Compare a bounded traversal implementation with metadata-assisted routing. Choose the smallest
  maintainable approach meeting the measured budgets, rather than mandating a complex index.
- Prove SSR selection and streaming feasibility at this stage, before committing to a DOM-only model.

Exit: one selected architecture, evidence for its cost, and a classified artifact contract.

### 3. Implement the versioned contract across execution paths

- Implement namespace target bindings, supplied-target placement and contributions, local refs, and attachment
  lifecycle as separate cohesive responsibilities with required JSDoc.
- Update compiler metadata and native diagnostics, DOM activation and reconciliation, server
  selection/streaming, hydration reconstruction, and testing inspection together.
- Preserve domains, parent-owned inputs, compiler-native bindings, context ordering, ref/event
  ownership, cancellation, and enhanced target DOM identity where the contract preserves it.
- Migrate affected library consumers using ordinary refs and the agreed supplied-target contract. Fix
  framework ownership defects at their source rather than adding application workarounds.

Exit: the behavior matrix passes across applicable execution paths and representative libraries.

### 4. Validate lifecycle, performance, and compatibility

Use the component composition corpus for cross-renderer cases, focused routing tests for selection,
and lifecycle tests for disposal, generation fencing, and concurrency. Protect observable behavior,
not incidental wrapper layouts or helper names. Include authored control bindings and event/ref
ordering, dynamic root changes, enhanced enhancements, portal routing, Activity, Suspense, lazy
replacement, server request isolation, and hydration identity. Execute the mandatory intl validation
matrix across extraction/build and runtime packages. Share fixtures where ownership allows.

Run the baseline matrix and relevant package/build/platform/ABI checks. Check retained memory after
repeated churn and verify unrelated scalar updates do not cause route traversal or reattachment.
Keep released fixtures unchanged; test that incompatible artifacts fail clearly before mounting or
hydrating instead of silently acquiring different semantics.

Exit: correctness and agreed performance gates pass, with a report explaining any accepted tradeoffs.

### 5. Document and release deliberately

The default recommendation is an explicit semantic ABI revision and the repository-required minor
versions for affected providers at 0.x, or major versions at 1.0 and later. Determine the exact package set in phase 1.
A helper signature remaining unchanged does not make changed target semantics compatible. Avoid a
permanent dual routing mode; if compatibility support is required, bound it explicitly and test it.

Update current engineering references, public Enhancements and relevant component/ref documentation,
docs-app metadata and examples, affected package READMEs and usage guides, and release guidance.
Explain the migration from `_target` discovery/export to supplied-target placement, namespace bindings,
and independent refs, including Text/fragment capabilities and intl examples. Preserve historical
rationale with a superseded-contract pointer when the new contract ships.
Move this plan to history only after implementation and acceptance evidence are complete.

Exit: versioned artifacts, migration guidance, frozen-fixture checks, and publication preflight agree.
Implementation of this plan does not itself authorize package publication.

## Immediate scope

Complete phase 1 and the prototype gates before production migration. Do not combine this migration with document-shell
delivery or chart adoption, remove `_target`, or introduce a general child participation API as a
shortcut. Public documentation continues to describe existing behavior until implementation lands.
