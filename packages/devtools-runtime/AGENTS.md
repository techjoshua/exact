# Using @exactjs/devtools-runtime

Install the runtime once per inspected page only when the build enables runtime inspection. Pass
the application’s existing eXact endpoint; browser requests use the page’s authenticated,
same-origin fetch session.

Do not probe a conventional endpoint on client-only pages. Server cooperation requires an
explicit runtime endpoint or a bounded endpoint discovered from compiler-owned hydration
metadata; without either, open a local client inspection session and perform no server request.
Expect compiled native root cells to preserve the root inspection domain when they are unwrapped.

Treat the page hook as read-only. Do not add task invocation, state mutation, callback access, or
arbitrary evaluation methods. Always dispose the installation so DOM sinks, subscriptions, server
sessions, highlights, and global hook ownership are released deterministically.

Project all coordinated work through `tasks.list`, `tasks.get`, and
`tasks.getTree`. Preserve activation, parent, generation, readiness, priority,
placement, semantic kind, optional name, and structural-settlement metadata;
do not restore an action-only collection or treat kind/name as authority.
