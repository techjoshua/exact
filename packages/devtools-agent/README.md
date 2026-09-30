# @exactjs/devtools-agent

Read-only programmatic access to eXact DevTools data through Chrome DevTools Protocol.

## When to use it

Use this package when an automated performance, debugging, or auditing tool needs the same
structured component and profiler data shown by the Chromium extension. The target page must
already expose the eXact DevTools runtime.

## Connection

Call `connectExactDevtoolsAgent()` with the CDP connection details for an existing Chromium
target. The returned connection implements the shared inspection query service and provides
`disconnect()` for cleanup. With an existing page target's WebSocket URL:

```ts
import { connectExactDevtoolsAgent } from '@exactjs/devtools-agent';

const connection = await connectExactDevtoolsAgent({
	webSocketUrl: 'ws://127.0.0.1:9222/devtools/page/REPLACE_WITH_TARGET_ID'
});
try {
	const response = await connection.request({
		protocol: 1,
		id: 'inspect-roots',
		method: 'roots.list',
		params: { page: { limit: 20 } }
	});
	if (!response.ok) throw new Error(`${response.error}: ${response.reason ?? ''}`);
	console.log(response.result);
} finally {
	await connection.disconnect();
}
```

The URL identifies a page in a Chromium instance with remote debugging already available.
Query `session.describe` for capabilities, then follow a root through `components.tree` and
`components.get`. Preserve returned runtime identities when querying `state.get`, `tasks.list`,
`dependencies.explain`, or `errors.list`. The installed `@exactjs/devtools-protocol` declarations
specify each request and result. Collection responses may include a continuation cursor.

An unavailable hook or denied query is an inspection failure, not an empty application.
After navigation or session expiration, discover the new roots and identities. Close any
subscription handles before disconnecting.

The adapter uses fixed CDP functions and validated by-value arguments. It cannot invoke component
work, mutate state, widen redaction, request unbounded data, or evaluate caller-provided
JavaScript.

Connection establishment, target discovery, and individual CDP requests are time-bounded. Target
discovery responses, WebSocket messages, and the number of pending requests are bounded as well. Advanced callers may
tune these ceilings with `ExactCdpConnectionOptions` and cancel work with an `AbortSignal`.

[Documentation](https://techjoshua.github.io/exact/#/learn/devtools) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/devtools-agent)
