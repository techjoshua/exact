import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Callout } from './Callout.jsx';

/** Explains optional server task snapshots and their invocation-owned receivers. */
export function TaskProgress(this: Component<{}>) {
	return () => (
		<section>
			<h2>Optional progress from a server task</h2>
			<p>
				Declare a component task with <code>TaskContext.client().progress()</code> and one snapshot
				parameter. Call it from a server task to report replaceable observations.
			</p>
			<CodeBlock
				language="tsx"
				title="Progress receiver"
				source={`const showProgress = async (
  snapshot: { completed: number; total: number },
  task: TaskContext = TaskContext.client().progress()
) => {
  this.state.progress = snapshot;
}

const run = async (task: TaskContext = TaskContext.server()) => {
  return processItems({
    signal: task.signal,
    onProgress: snapshot => showProgress(snapshot)
  });
}`}
			/>
			<p>
				Snapshots are inherently missable. Each must stand alone; do not use progress for
				increments, required notifications, or business side effects. The final task result remains
				authoritative. Reporting returns no browser result and does not wait for delivery. Snapshots
				use operation serialization and are limited to 64 KiB, depth 32, and 10,000 nodes.
			</p>
			<p>
				Asynchronous receivers are supported. One activation runs at a time while newer reports
				replace the pending snapshot. Successful activations publish their own staged state.
				Receiver failures discard unpublished writes and reach diagnostics without changing the
				server result. Final settlement, cancellation, supersession, or disposal cancels active
				receiver work and drops pending snapshots. The final result does not wait for receiver
				cleanup. Use task-owned work and its signal; cancellation cannot undo external effects.
			</p>
			<p>
				Receivers default to nonblocking readiness. Priority and readiness policies remain
				available; concurrency, keys, and detached ownership belong to the progress lane. SSR
				reports are no-ops without hydration replay. Rejoining a shared job after reload requires an
				application-owned join task.
			</p>
			<Callout title="Streaming deployment required">
				<p>
					Progress uses Fetch with NDJSON, not SSE. The complete HTTP path must forward chunks
					before the task finishes. The generic serverless adapter disables progress and warns with
					affected component and receiver names, while returning the ordinary final result. Other
					deployments can opt out through the server context's
					<code>{"progress: { supported: false, reason: 'deployment buffers responses' }"}</code>
					setting. There is no automatic retry, polling, or replay. Deferred task priority does not
					guarantee streaming or extend the request lifetime. Detected client disconnection aborts
					the server task and runs its owned cleanup. Host disconnect detection may wait for another
					response write.
				</p>
				<p>
					See <a href="/runtimes">runtime and deployment requirements</a>.
				</p>
			</Callout>
		</section>
	);
}
