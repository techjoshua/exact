# Maintaining the Workbench sample

Keep `Workbench` as a setup-once, inspectable owner. Store mutable project data in `this.state`,
derive filtered and selected views through compiler-observed expressions, and expose cohesive
commands through `WorkbenchContext`.

Autosave is a client `latest()` task activated by serialized task state. The debounce helper is an
opaque Promise adapter: pass it the task signal, clear its timer on abort, and let compiler-lowered
await fencing stop stale storage and state writes. Do not add a second generation counter or
post-await abort check.

Refs and focus handoff belong to the mounted dialog or panel instance. Keep keyboard listeners
task-owned through an abort signal. Run `npm run build:workbench` after component changes.
