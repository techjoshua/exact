# Maintaining the Workbench sample

Keep `Workbench` as a setup-once, inspectable owner. Store mutable project data in `this.state`,
derive filtered and selected views through compiler-observed expressions, and expose cohesive
commands through `WorkbenchContext`.

Autosave is a reactive task activated by serialized task state. Let reactive activation infer
latest-wins scheduling and let `localStorage` infer client placement. The debounce helper exposes
an optional final `AbortSignal`; omit it at the task call so the compiler supplies the generation
signal, then let compiler-lowered await fencing stop stale storage and state writes. Do not add a
second generation counter or post-await abort check.

Refs and focus handoff belong to the mounted dialog or panel instance. Keep keyboard listeners in
their owning component task and let the compiler add the listener signal. Run
`npm run build:workbench` after component changes.
