# Maintaining the Kanban sample

Treat `Board` as the durable owner of board state and commands. Mutate observable task objects and
collections directly when identity must survive drag reordering; do not introduce hooks, reducers,
or immutable replacement ceremony by habit.

Keep the finite columns in ordinary keyed JSX and the cohesive mutation surface in
`BoardContext`. Persistence is a reactive task whose serialized argument is its dependency;
`localStorage` lets the compiler infer client placement. Reactive activation already supersedes
prior work, so do not add authored placement, manual generation state, or invoked-task concurrency
policy.

Pointer-drag DOM clones are component-local resources and must be removed on every completion,
cancellation, lost-capture, and unmount path. Run `npm run build:kanban` after component changes.
