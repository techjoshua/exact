import { CodeBlock } from '../CodeBlock.jsx';
import { taskSources } from './task-sources.js';

/** Demonstrates a task that saves each new draft value. */
export function TaskBasics() {
	return () => (
		<section>
			<h2>Run a function when state changes</h2>
			<CodeBlock source={taskSources.inferredTaskSource} language="tsx" title="DraftEditor.tsx" />
			<p>
				<code>persistDraft</code> writes the draft to browser storage. The call in the component
				body tells eXact to run it initially and whenever <code>this.state.draft</code> changes. Its
				argument supplies the value for that run. Observing a task’s status or using it as an event
				callback keeps its setup subscription intact. Browser storage also tells the compiler that
				this work belongs in the browser.
			</p>
			<p>
				When a new draft arrives, eXact cancels the previous run and starts a replacement. A call
				from a click handler instead runs when the user clicks. A task called by another task
				belongs to that parent run, so cancellation can stop the related work together.
			</p>
			<p>
				The function is the task <strong>definition</strong>. An event or input change that starts
				it is an <strong>activation</strong>. Each run is a <strong>generation</strong>, with its
				own status, result, and cancellation signal. These terms appear in the policy reference and
				in DevTools.
			</p>
			<p>
				For work the compiler cannot recognize through an imported wrapper, or to choose a different
				execution policy, add the context parameter described next.
			</p>
		</section>
	);
}
