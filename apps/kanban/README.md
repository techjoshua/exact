# eXact Kanban Sample

A small Kanban board used as a living exercise for the current eXact framework slice.

## Run

From the workspace root:

```sh
npm run dev:kanban
npm run build:kanban
```

## What It Exercises

- Compiler-backed JSX through the eXact Vite plugin.
- Component instances with reactive state.
- Context services through `BoardContext`.
- Ordinary `Array.map()` lists lowered through type-level `@exact key` metadata.
- Reactive text, prop, style, and form bindings.
- Local storage persistence through reactive tasks.
- DOM refs/events/lifecycle behavior through card editing and drag-reorder flows.
- Component logging through `LoggerContext`.
- Root framework logging through `render(..., { logger })`.

Persistence is a synchronous task activated by the serialized task collection.
The compiler infers client placement from `localStorage`, and reactive
activations already supersede older generations, so the sample does not add
placement, concurrency, cancellation, or lifecycle ceremony.

## User Flows

- Add and remove cards.
- Drag cards between columns.
- Reorder cards within a column by dragging.
- Open card notes/details.
- Edit title and notes while the visible card updates reactively.
- Reload the page and keep saved cards from local storage.
