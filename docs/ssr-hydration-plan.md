# SSR And Hydration Plan

This note captures the current direction for server rendering and hydration. It is a planning document, not an implementation commitment for the current slice.

## Goals

- Keep `@exact/core` platform-neutral.
- Add server rendering without DOM globals, DOM types, or browser-only behavior.
- Add client hydration without forcing SSR concerns into the normal DOM renderer.
- Preserve eXact's core model: component instances, reactive values, context, keyed lists, cells, logging, and error contexts.
- Make failures observable through `ErrorContext` and framework logging rather than ad hoc console output.

## Package Boundaries

### `@exact/ssr`

Owns server rendering:

- Converts core vnodes to HTML strings or streams.
- Executes component constructors and render functions in a server render scope.
- Resolves async server work only if/when an explicit async primitive exists.
- Emits hydration markers for component, cell, dynamic, fragment, and keyed-list boundaries.
- Captures initial serializable state only through an explicit API, not by walking arbitrary objects by surprise.
- Reports render/construction failures to the active `ErrorContext`.

### `@exact/hydrate`

Owns client reattachment:

- Walks existing server HTML and matches it to core vnode/cell boundaries.
- Reuses DOM nodes where markers and vnode identity agree.
- Rebuilds component instances and reactive watchers.
- Attaches delegated events and refs.
- Falls back to normal DOM patching when markup cannot be trusted.
- Reports hydration mismatches through framework logging, with strict-mode failure as an option later.

### `@exact/dom`

Remains browser rendering:

- Continues to own fresh DOM mounting and patching.
- Shares placement/prop/style/ref/event behavior with hydration where practical.
- Does not become responsible for string rendering.

## Marker Model

SSR needs enough markers for hydration to know where reactive boundaries begin and end:

- Component boundary.
- Cell boundary.
- Dynamic child boundary.
- Fragment boundary.
- Keyed list boundary and item keys.
- Text/reactive expression boundary when text may update independently.

Markers should be compact, deterministic, and ignorable by normal browser rendering. HTML comments are the likely v1 mechanism.

Example shape, not final syntax:

```html
<!--exact:component:c12:TaskCard-->
<!--exact:cell:s4-->
<article data-exact-key="task-1">...</article>
<!--/exact:cell:s4-->
<!--/exact:component:c12-->
```

## State And Serialization

The framework should not serialize every reactive object automatically. That would be surprising and hard to secure.

Prefer an explicit state capture model:

- Components or app roots opt into serializable state.
- Captured state is JSON-safe by default.
- Functions, DOM nodes, class instances, `Map`, `Set`, `Date`, and other non-plain objects are not serialized in v1.
- Hydration can accept preloaded state and pass it into app code through props or context.

## Error Behavior

Server failures should follow the same model as client failures:

- Construction/render/task-like server failures report to the nearest `ErrorContext`.
- A boundary can render an error view, render children anyway, or clear/report errors.
- Root SSR fallback should render a default error document or fragment if no boundary handles the failure.
- Framework logs should use `LoggerContext`/root logger style configuration where possible.

## Hydration Matching Rules

Hydration should be conservative:

- Same boundary kind, type, and key: attach and continue.
- Same DOM element type: attach props/events/refs and hydrate children.
- Text mismatch: update text and log a debug/trace mismatch event.
- Structural mismatch: replace the mismatched subtree with normal DOM render output.
- Missing marker: treat as mismatch unless running an explicitly permissive mode.

## Open Design Questions

- Do component ids need to be stable across server/client, or are marker-local ids enough?
- How much source/location metadata should the compiler emit for useful hydration diagnostics?
- Should streaming SSR be v1, or should v1 be synchronous string rendering only?
- What is the smallest explicit state capture API that feels natural?
- Should hydration be a separate app entrypoint (`hydrate(vnode, container)`) or a `render(..., { hydrate: true })` option? Current preference is a separate `@exact/hydrate` entrypoint.

## Suggested Implementation Order

1. Add `@exact/ssr` with static string rendering for plain vnodes, text, fragments, cells, and DOM props.
2. Add SSR component construction/rendering with context, logging, and `ErrorContext`.
3. Add deterministic boundary markers.
4. Add `@exact/hydrate` that attaches to static DOM nodes and simple components.
5. Add keyed list hydration.
6. Add reactive text/prop/style watcher attachment.
7. Add mismatch diagnostics and fallback replacement.
8. Add explicit state capture and preload handoff.

