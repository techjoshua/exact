# @exactjs/devtools-agent

Read-only programmatic access to eXact DevTools data through Chrome DevTools Protocol.

## When to use it

Use this package when an automated performance, debugging, or auditing tool needs the same
structured component and profiler data shown by the Chromium extension. The target page must
already expose the eXact DevTools runtime.

## Connection

Call `connectExactDevtoolsAgent()` with the CDP connection details for an existing Chromium
target. The returned connection implements the shared inspection query service and provides
`disconnect()` for cleanup.

The adapter uses fixed CDP functions and validated by-value arguments. It cannot invoke component
work, mutate state, widen redaction, request unbounded data, or evaluate caller-provided
JavaScript.

Connection establishment, target discovery, and individual CDP requests are time-bounded. Target
discovery responses, WebSocket messages, and the number of pending requests are bounded as well; advanced callers may
tune these ceilings with `ExactCdpConnectionOptions` and cancel work with an `AbortSignal`.
