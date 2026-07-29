# @exactjs/devtools-agent

Read-only Chrome DevTools Protocol adapter for the eXact inspection query service.

The adapter attaches to an existing Chromium target, detects
`Symbol.for('@exactjs/devtools-hook')`, connects through the page’s authenticated debug session,
and projects the same validated requests and events used by the human DevTools panel.

It uses fixed CDP function declarations plus by-value protocol arguments. Callers cannot supply
JavaScript, invoke actions, mutate state, expand redaction, or request unbounded results. Disconnect
closes page subscriptions, removes the CDP binding, releases the runtime object group, and closes
the socket.
