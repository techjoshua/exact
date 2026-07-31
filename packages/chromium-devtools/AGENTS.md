# Using the eXact Chromium DevTools project

Keep every panel a projection of the shared `ExactInspectionQueryService`; do not parse rendered
panel text or reach into component objects. Page-world communication must use the fixed page bridge
and validated protocol requests.

Present every durable component instance in the Components tree and preserve its parent/child
hierarchy for state comparison, element highlighting, source lookup, and exact protocol queries.
Aggregate only the Profiler presentation by authored component type. Profiler capture is
panel-local and bounded: group protocol events into causal frames and component-type lanes without
changing runtime scheduling or inventing cross-host event order. Treat subscription events as a
live preview; Stop must finalize from paged retained history after the recording's merged cursor.

Source links require matching hashes. Preserve build, execution-root, binding, instance,
operation, and generation identity across selections. Panel disposal must disconnect the page
hook, close subscriptions, clear highlights, and release extension ports.

Render stable task `kind` independently from an optional human-facing name. Do
not infer identity or authority from either field.

Version 1 is read-only. Do not add task invocation, state editing, task cancellation, arbitrary
evaluation, or redaction overrides.

Keep manifest `content_scripts` compatible with Chromium's classic-script execution contract.
Their TypeScript sources may remain modules, but the package build must bundle the page bridge and
isolated-world entry as separate IIFEs without top-level ESM syntax. Bundle the background,
DevTools, and panel module entries independently as well; extension pages cannot resolve bare
workspace package specifiers at runtime.

Treat extension-port disconnect as a terminal content-script transition. Stop forwarding page
messages before notifying the page hook, and acknowledge `runtime.lastError` inside Chromium's
disconnect callback so extension reloads cannot leak stale responses or unchecked errors.

DevTools panel page paths are resolved from the extension root, not from the generated
`dist/devtools.html` document. Keep panel registration pointed at `dist/panel.html`.
