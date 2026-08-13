import { CodeBlock } from '../CodeBlock.jsx';
import { Callout } from './Callout.jsx';
import { taskSources } from './task-sources.js';

/** Introduces inferred task activation and the runtime's lightweight consequence paths. */
export function TaskBasics() {
	return () => (
		<section>
			<h2>Start with an ordinary function</h2>
			<CodeBlock source={taskSources.inferredTaskSource} language="tsx" title="DraftEditor.tsx" />
			<p>
				There is no task registration API in this example. The compiler sees the browser storage
				effect and classifies <code>persistDraft</code> as client work. Its setup-scope call is both
				an initial activation and a reactive declaration. Reading <code>this.state.draft</code>{' '}
				while evaluating the argument makes that state the activation dependency.
			</p>
			<p>
				Each later draft change creates a new reactive generation and supersedes the previous one. A
				call from a click handler instead creates an invoked generation for that interaction, and
				calling a task from another task attaches a child generation automatically.
			</p>
			<p>
				Known storage, timer, listener, and DOM APIs infer client work and cancellation. Reactive
				setup calls infer latest-wins activation, and ordinary child calls infer parallel
				invocation. Author <code>TaskContext</code> for an environment boundary, non-default policy,
				or opaque capability the compiler cannot discover.
			</p>
			<p>
				A synchronous function call used as a local initializer remains an ordinary JavaScript
				expression. Awaited work may still become a task, and a final <code>TaskContext</code>
				parameter makes task intent explicit.
			</p>
			<p>
				A synchronous invalidation wave shares one lightweight consequence lifetime. Interactive DOM
				work reuses its still-open producer, while inspection retains complete frame detail.
			</p>
			<p>
				An uncontended awaited continuation restores its frame in the promise-resolution job;
				overlapping resumptions remain serialized so they cannot exchange ownership.
			</p>
			<Callout title="Async is not the marker">
				<p>
					A function does not become a task merely because it is <code>async</code>. Coordination
					needs—not promise syntax—are what make the function a task.
				</p>
			</Callout>
		</section>
	);
}
