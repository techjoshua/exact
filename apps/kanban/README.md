# eXact Kanban sample

A small local-first board demonstrating native eXact component state, contexts, keyed lists,
bindings, drag interactions, and persistence.

## Run locally

```sh
npm run dev:kanban
```

Create, edit, move, reorder, and delete cards. Changes are saved to local storage and restored
after a reload.

## Production build

```sh
npm run build:kanban
```

The sample is intentionally compact and is a useful starting point for understanding durable
component instances and fine-grained updates. It uses `@exactjs/theme` for its application scope,
generated visual tokens, semantic fields and actions, and column surfaces while retaining its
board-specific layout and drag presentation.
