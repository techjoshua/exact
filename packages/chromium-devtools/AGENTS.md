# Using the eXact Chromium DevTools project

Keep every panel a projection of the shared `ExactInspectionQueryService`; do not parse rendered
panel text or reach into component objects. Page-world communication must use the fixed message
bridge and validated protocol requests.

Source links require matching hashes. Preserve build, execution-root, binding, instance,
operation, and generation identity across selections. Panel disposal must disconnect the page
hook, close subscriptions, clear highlights, and release extension ports.

Version 1 is read-only. Do not add action invocation, state editing, task cancellation, arbitrary
evaluation, or redaction overrides.
