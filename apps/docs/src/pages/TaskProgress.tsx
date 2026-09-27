import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Callout } from './Callout.jsx';

/** Shows intermediate server-task updates before explaining delivery and deployment limits. */
export function TaskProgress(this: Component<{}>) {
	return () => (
		<section>
			<h2>Show progress while a server task runs</h2>
			<p>
				An import that processes hundreds of items can leave the user staring at a spinner with no
				idea whether anything is happening. Reporting progress often means building a second path
				for updates and keeping it tied to the original request. With eXact, the server task calls a
				client task to report progress, and the framework delivers those updates and stops them when
				the operation ends. Start with the{' '}
				<a href="#/learn/server-execution">server execution guide</a>
				if you have not yet called a server task from a component.
			</p>
			<p>
				Define a client task with <code>TaskContext.client().progress()</code>. This is the
				<strong>receiver</strong>: its single data parameter holds the current progress. The server
				task calls it like a function. eXact delivers the update to the browser.
			</p>
			<CodeBlock
				language="tsx"
				title="Tasks inside an import component"
				source={`const showProgress = (
  snapshot: { completed: number; total: number },
  task: TaskContext = TaskContext.client().progress()
) => {
  this.state.progress = snapshot;
};

const run = async (task: TaskContext = TaskContext.server()) => {
  return processItems({
    signal: task.signal,
    onProgress: snapshot => showProgress(snapshot)
  });
};`}
			/>
			<p>
				Here, <code>processItems</code> is an application helper that accepts a cancellation signal
				and reports completed and total counts. The view can display those counts from
				<code>this.state.progress</code>. The caller of <code>run()</code> receives the final result
				in the usual way.
			</p>
			<h3>Send the current total with every update</h3>
			<p>
				Progress updates may be skipped. While one is being delivered or handled, a newer update can
				replace the pending one. Send “30 of 100 complete” so it can be displayed on its own. An
				“increment by one” message would lose information when an update is skipped. Save required
				results and business effects in the server operation, and use its final result to display
				completion.
			</p>
			<p>
				The server continues without waiting for the browser to receive or handle an update. When
				the server task finishes, is cancelled, or is replaced, eXact stops the receiver and
				discards pending updates. Removing the component does the same. Code that must finish should
				therefore run as part of the main operation.
			</p>
			<Callout title="Check streaming support on your host">
				<p>
					Updates travel in the response to the browser’s request, using Fetch and newline-delimited
					JSON (NDJSON). The server and any proxy must forward response chunks before the operation
					finishes. A buffering host can deliver the final result but cannot show live progress. The
					generic serverless adapter disables progress and names affected components and receivers
					in a warning. See <a href="#/runtimes">runtime and deployment requirements</a>
					for configuration and hosting limits.
				</p>
			</Callout>
			<details>
				<summary>Receiver behavior and limits</summary>
				<p>
					Receivers can be asynchronous. One runs at a time, with at most one newer update waiting.
					Successful runs publish their state changes. A failed run discards unpublished changes and
					reports the error through diagnostics. The server result is unaffected. Final settlement
					does not wait for receiver cleanup. Use the task signal for asynchronous work.
					Cancellation cannot undo external effects already performed.
				</p>
				<p>
					Each update uses operation serialization, with limits of 64 KiB, nesting depth 32, and
					10,000 nodes. Receivers default to nonblocking readiness and accept priority and readiness
					policies. Their concurrency, keys, and attachment to the invoking task are managed by the
					progress mechanism.
				</p>
				<p>
					Server rendering ignores progress reports and does not replay them during hydration.
					Batched calls without a local receiver also ignore progress while retaining their final
					results. Reloading a page requires application code to rejoin any shared job. There is no
					automatic retry, polling, or replay. Deferred priority changes scheduling. Request
					deadlines and streaming requirements still apply.
				</p>
			</details>
		</section>
	);
}
