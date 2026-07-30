# Using @exactjs/devtools-runtime

Install the runtime once per inspected page only when the build enables runtime inspection. Pass
the application’s existing eXact endpoint; browser requests use the page’s authenticated,
same-origin fetch session.

Treat the page hook as read-only. Do not add task invocation, state mutation, callback access, or
arbitrary evaluation methods. Always dispose the installation so DOM sinks, subscriptions, server
sessions, highlights, and global hook ownership are released deterministically.

Project all coordinated work through `tasks.list`, `tasks.get`, and
`tasks.getTree`. Preserve activation, parent, generation, readiness, priority,
placement, and structural-settlement metadata; do not restore an action-only
collection.
