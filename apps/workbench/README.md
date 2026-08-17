# eXact Workbench sample

A local-first project planner with board, list, and detail views over one component-owned model.

## Run locally

```sh
npm run dev:workbench
```

The app supports task creation and editing, search, status and priority changes, labels, owners,
activity history, local autosave, a command palette, and JSON import and export.

## Production build

```sh
npm run build:workbench
```

Workbench demonstrates multiple derived views, context-based commands, component-owned resources,
focus management, recoverable errors, and async persistence without introducing a separate state
store. It also uses `@exactjs/theme` package-scoped enhancements and generated semantic tokens while
retaining application-owned board, panel, and responsive layout CSS.
