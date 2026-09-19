# Child composition adoption review

This review separates layout composition from lifecycle coordination. The public API is documented
in [child composition and document shells](child-composition.md); unresolved per-child capability
ownership belongs to [scoped participation](proposals/cooperative-structured-children.md).

## Adopted: chart title and description placement

[Chart](../component-libraries/charts/src/components.tsx) now partitions immediate `ChartTitle` and
`ChartDescription` children. Captions and descriptions render directly under the figure before the
axis/series declaration region. Previously a child-authored figcaption was inside the declaration
div, unlike the title-prop form.

The original component operations are rendered once; chart context, localized label ownership,
axis/series/data registration, and cleanup remain intact. Props still provide the compact label
form. Authors choose props or immediate child components for each label; fragments and wrapper
implementations are not searched. Client and server checks protect caption placement, and a reactive
label check protects retained DOM identity.

## Reviewed candidates

| Consumer                                                                                                                                              | Decision                               | Reason and next step                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Document](../packages/core/src/document/composition.ts)                                                                                              | Already adopted                        | Uses all three helpers to preserve authored html/head/body attributes while filling missing structure and framework output. This remains the main existing use for `childrenOf` and `withChildren`.                                                                                                                                                   |
| [Chart](../component-libraries/charts/src/components.tsx)                                                                                             | Adopt immediate label partitioning     | Separate caption and description placement; keep axes, series, data, and legend coordination in their existing contexts. No receipt-to-instance lookup is needed.                                                                                                                                                                                     |
| [Shipping calculator document](../apps/shipping-calculator/src/server-app.tsx)                                                                        | Next integration candidate             | Replace the hand-built document template and `<!--exact-app-->` split with a compiled shell and request assets. First account for the development `transformHtml` callback, request hydration configuration, root container, HEAD cancellation, and stream completion. This is a response-integration migration, not a mechanical string replacement. |
| [BrandShell](../apps/microfrontend-portal/branding/src/BrandShell.tsx) and [CompactShell](../apps/microfrontend-portal/branding/src/CompactShell.tsx) | Keep named props                       | Navigation, account, and content already have explicit slots shared by alternate remote shells. Converting them to child marker components adds an API and migration without demonstrated simplification.                                                                                                                                             |
| [Docs Article](../apps/docs/src/pages/Article.tsx) and [Callout](../apps/docs/src/pages/Callout.tsx)                                                  | Keep current props                     | Scalar titles and explicit navigation metadata are simpler than new marker components. Reconsider partitioning if these layouts gain independently authored rich header or action regions.                                                                                                                                                            |
| [Forms](../component-libraries/forms/src/form/form.tsx) and [Field](../component-libraries/forms/src/form/field.ts)                                   | Keep registration                      | Fields expose validation behavior and release registrations at unmount. Sorting direct children cannot replace those capabilities or discover fields inside opaque wrappers.                                                                                                                                                                          |
| [Motion Presence](../component-libraries/motion/src/presence.ts) and [LayoutGroup](../component-libraries/motion/src/layout.ts)                       | Keep lifecycle ownership               | Presence preserves keyed outgoing generations and LayoutGroup registers mounted participants and cancellation. Array normalization through partitioning would not provide those guarantees and could change positional fallback identity.                                                                                                             |
| [Accessibility navigation](../packages/accessibility/src/navigation.ts)                                                                               | Keep mounted DOM inspection            | Eligibility depends on hidden/inert/disabled state, nearest composite ownership, focusability, and actual grid rows. Authored direct-child order is insufficient.                                                                                                                                                                                     |
| [ThemePreferenceProvider](../component-libraries/app-theme-preference/src/components.tsx)                                                             | Do not substitute the new `childrenOf` | Its same-named private helper only normalizes a scalar or array. The public helper reads intrinsic contents and is not a drop-in replacement. Forwarding cleanup, if desired, is independent of structural composition.                                                                                                                               |
| [React router compatibility](../component-libraries/router/src/modern/routers.ts)                                                                     | Keep React child handling              | React-owned route elements cross the explicit compatibility boundary. Native receipt helpers cannot replace React's element and fragment semantics.                                                                                                                                                                                                   |

There is no useful blanket replacement for existing children forwarding or context registration.
Use `partitionChildren` when a component already owns multiple output regions and needs to recognize
direct child roles. Use `childrenOf` only when it must read an authored intrinsic's contents;
pair it with `withChildren` to preserve that intrinsic's bindings and ownership metadata.

## Remaining validation of the composition implementation

Compiler preservation of intrinsic receipts currently applies across component child boundaries,
including consumers that never partition. The helpers create new partition arrays rather than
maintaining stable incremental child sequences. Their cost must not be described as opt-in-only
or as negligible on the basis of the SSR smoke run.

Before making a performance claim, compare unchanged nonparticipating components and participating
document/chart consumers against the previous compiler. Measure artifact and bundle size, SSR,
hydration, scalar updates, structural changes, allocations, and retained heap. Optimizations must
preserve opaque boundaries, contextual namespaces, enhancements, keyed ownership, and exact-once
rendering. This is work on the implemented composition API, separate from deciding whether a new
child-participation capability is needed.
