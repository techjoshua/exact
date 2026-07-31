# eXact Workbench Sample

This app is the second sample application for eXact. It is intended to grow into a compact local-first project planner: part issue tracker, part board, part detail workbench.

## Purpose

The Kanban app proves drag, keyed lists, dialogs, context, and autosave. The workbench sample should push the framework through a broader product surface:

- Nested project state: tasks, labels, priority, owner, status, and activity.
- Multiple views over the same data: board, list, detail panel, and later command palette.
- Fine-grained derived UI: search results, counts, selected task, visible columns, and metadata chips.
- Managed work: local autosave now; debounced search, import/export, and simulated sync later.
- Context services: task mutations, logging, error reporting, and app-level actions.
- Ref-heavy interactions: focus management, command palette, dialogs, and editor controls.

The component owns state directly and exposes cohesive commands through
`WorkbenchContext`. Autosave is a reactive `latest()` client task. Its opaque
Promise-based debounce adapter accepts the task signal and releases its timer
on cancellation; compiler-lowered awaits fence the continuation before storage
or state can be updated.

## Completion Pass

The app now includes the planned v0 workbench behaviors:

- Board and list views over the same task data.
- Search across title, notes, owner, and labels.
- Task creation, selection, editing, status movement, priority changes, owner edits, and label editing.
- Local autosave with visible sync state.
- Activity history for user actions.
- Command palette opened from the Actions button or Ctrl/Cmd+K.
- JSON import/export dialog with recoverable validation errors.
- Root error boundary with an explicit demo failure command.
- Ref-backed focus handoff for task detail, command palette, and import/export dialog.

## Further Milestones

1. Add automated browser-level smoke tests for the full workflow.
2. Add drag-and-drop reordering once the framework has a preferred pointer interaction helper.
3. Split framework release-gate scenarios into reusable fixtures if more sample apps are added.

## Running

```sh
npm run dev:workbench
npm run build:workbench
```
