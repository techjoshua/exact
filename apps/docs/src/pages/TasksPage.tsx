import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { TaskProgress } from './TaskProgress.jsx';
import { TaskBasics } from './TaskBasics.jsx';
import { TaskIntroduction } from './TaskIntroduction.jsx';
import { taskSources } from './task-sources.js';

/** Documents function-defined tasks, scheduling, readiness, and cleanup. */
export function TasksPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Tasks, scheduling, and Suspense"
			description="Run work when an input changes or a user takes an action. Track its status and cancel work that is no longer needed."
			previous={{ path: '/learn/lists', label: 'Keyed lists' }}
			next={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
		>
			<TaskIntroduction />
			<TaskBasics />
			<section>
				<h2>Save when the user asks</h2>
				<p>
					Automatic saving is useful for some editors. Others need a Save button so the user can
					finish a draft before storing it. Calling the task from the click handler runs it for that
					click.
				</p>
				<CodeBlock source={taskSources.invokedTaskSource} language="tsx" title="DraftEditor.tsx" />
				<p>
					This example writes to browser storage. The task exposes <code>pending</code> and
					<code>error</code>, so the view can prevent overlapping clicks and explain a failed save.
					A storage write is synchronous, so its pending state may be too brief to see. The same
					status properties work for a task that waits for a network request.
				</p>
				<p>
					<code>taskStatus(save)</code> provides the same status as
					<code>save.pending</code> and <code>save.error</code>. It also supports a view scoped to a
					task key. A task's <code>result</code> holds its latest result, and{' '}
					<code>pendingCount</code> counts queued and running calls.
				</p>
			</section>
			<section>
				<h2>Replace a search when its input changes</h2>
				<p>
					A search should follow the latest query without letting an older response replace newer
					results. Calling the task in the component body connects it to its input. Each query
					change cancels the previous run and starts another.
				</p>
				<CodeBlock
					source={taskSources.reactiveTaskSource}
					language="tsx"
					title="Excerpt: search task inside a component"
				/>
				<p>
					The final <code>TaskContext</code> parameter gives the function access to the current run.
					Its default chooses client execution. Application code calls <code>search(query)</code>{' '}
					without passing that final argument. eXact supplies it.
				</p>
				<p>
					Passing <code>task.signal</code> lets the request stop when the query changes or the
					component is removed. Even if an old request finishes, its cancelled task cannot replace
					component state.
				</p>
			</section>
			<section>
				<h2>Cancel work and release resources</h2>
				<p>
					Input changes and component removal already cancel the work they replace or retire. If
					your interface also needs a Cancel button, its handler can call{' '}
					<code>search.cancel()</code>. Cancellation stops further task-owned state updates.
					External work that has already happened, such as a database write, cannot be undone by
					cancelling the browser task.
				</p>
				<p>
					Resources can follow the same lifetime. A feed listener, for example, should close its
					socket when its task ends. eXact recognizes standard APIs such as <code>fetch()</code>,
					<code>addEventListener()</code>, and <code>WebSocket</code>.
				</p>
				<CodeBlock
					source={taskSources.inferredLifetimeSource}
					language="tsx"
					title="Excerpt: a feed connection"
				/>
				<p>
					This task stays pending until the socket closes. If the feed URL changes or the component
					is removed first, eXact releases the old socket and listeners. A resource stays alive only
					for the task's lifetime, so a task that immediately returns also immediately runs its
					cleanup.
				</p>
				<details>
					<summary>Custom data clients and cleanup methods</summary>
					<p>
						For custom wrappers, you can pass <code>task.signal</code>, register a callback with
						<code>task.cleanup()</code>, or give a disposable resource to <code>task.own()</code>.
						The compiler can supply the signal when a call's type exposes an optional
						<code>AbortSignal</code> or an options parameter with <code>signal?: AbortSignal</code>.
						Existing signals and event options are combined or extended.
					</p>
					<p>
						Automatic resource cleanup requires a local resource with a recognized cleanup method.
						The compiler reports resources whose lifetime it cannot determine. Cleanup runs
						child-first and in reverse registration order within each task. When a resource offers
						both standard disposal methods, eXact selects <code>Symbol.asyncDispose</code> and
						awaits its result. It calls only that method, even if cleanup finishes synchronously.
					</p>
				</details>
			</section>
			<section>
				<h2>Choose what happens when calls overlap</h2>
				<p>
					Two clicks can start two saves before either finishes. By default, calls from events can
					run in parallel. You can choose <code>latest()</code> when only the newest request
					matters, or
					<code>queue()</code> when each save must finish in order. Reactive calls from the
					component body always replace their previous run.
				</p>
				<p>
					When one component saves several documents, <code>key(documentId)</code> gives each
					document its own queue. Saving one document then does not delay a different document.
				</p>
				<CodeBlock
					source={taskSources.schedulingSource}
					language="tsx"
					title="Excerpt: queue saves per document"
				/>
				<p>
					The example calls an application-provided server repository. The
					<a href="#/learn/server-execution">server execution guide</a> explains how to supply it.
					<code>saveDocument.pendingCount</code> counts all pending saves owned by this component.
					Each task must be declared inside its owning component. Shared module helpers can contain
					the reusable business logic.
				</p>
				<details>
					<summary>Status for one document</summary>
					<CodeBlock
						source={taskSources.keyedStatusSource}
						language="tsx"
						title="Excerpt: status for one key"
					/>
					<p>
						<code>taskStatus(task, {'{ key }'})</code> limits status and cancellation to that key.
						The key must match the task's policy and remains fixed for the lifetime of the status
						view. In a changing list, each keyed row component can instead own its own save task and
						status.
					</p>
				</details>
			</section>

			<section>
				<h2>Try again after a temporary failure</h2>
				<p>
					A forecast service might be briefly unavailable even though repeating its read request is
					safe. A checkout can fail after a payment has already succeeded. Retrying the whole
					checkout would repeat that payment. The useful retry boundary is the particular operation
					your application knows it can repeat.
				</p>
				<p>
					eXact does not automatically retry failed tasks. A Retry button can call a task again with
					the chosen arguments, starting a new invocation. For a temporary service failure, a
					bounded loop inside the task can repeat just its read request.
				</p>
				<CodeBlock
					source={taskSources.retryTaskSource}
					language="tsx"
					title="Excerpt: retry a forecast read inside a component"
				/>
				<p>
					This example assumes the application's forecast endpoint is safe to read again. It makes
					at most three requests and retries only HTTP 503 responses, waiting 250 ms and then 500
					ms. Network errors, other unsuccessful responses, and failures while reading the response
					propagate normally. The task stays pending throughout the loop. Its final failure follows
					the usual task error handling.
				</p>
				<details>
					<summary>A delay that stops when the task is cancelled</summary>
					<CodeBlock
						source={taskSources.retryDelaySource}
						language="ts"
						title="Application helper used by loadForecast"
					/>
					<p>
						Both the request and the delay use the same task signal. A newer call to
						<code>loadForecast</code> replaces the previous run because it selects
						<code>latest()</code>. Removing the component also cancels the run. The helper clears
						its timer and releases its listener when cancelled, so cancellation cannot start another
						attempt.
					</p>
				</details>
				<p>
					A service may specify a delay through <code>Retry-After</code>. Applications with many
					callers can also add bounded random jitter to spread their retries out. Attempt limits and
					delays should fit the service's rules and the application's request deadline. A server
					task still operates within its hosting limits.
				</p>
				<p>
					When a response is lost, a server write may already have completed. Repeating it safely
					requires an application or service contract, such as a stable operation key that the
					server uses to recognize an already completed write. Optimistic state rollback does not
					undo an external write. Progress snapshots also cannot establish whether an operation
					completed.
				</p>
			</section>
			<section>
				<h2>Show an edit before the server confirms it</h2>
				<p>
					A profile editor can show the submitted value while a save is still running.
					<code>task.optimistic()</code> applies synchronous state changes that eXact can roll back
					if the save fails or is replaced.
				</p>
				<CodeBlock
					source={taskSources.optimisticTaskSource}
					language="tsx"
					title="Excerpt: optimistic profile save"
				/>
				<p>
					Here <code>draft</code> holds the edited profile and <code>profile</code> is the value
					displayed elsewhere in the component. The optimistic callback displays the edit
					immediately. Rollback restores only changes still owned by that task. Later confirmed
					writes survive, including changes to individual array entries. When rolling back an
					insertion shifts other entries, their pending edits still roll back at the correct
					positions. Sorting or reversing the array also preserves those pending edits and
					insertions' rollback ownership. If overlapping saves both fail, rollback also removes the
					earlier failed edit. Your application still decides how to explain a failed save to the
					user.
				</p>
			</section>
			<details>
				<summary>Track selected inputs and capture other values</summary>
				<p>
					Calling a task in the component body tells eXact to run it when its input expressions
					change. Each change cancels the previous run and starts another. Calling it from an event
					handler, lifecycle callback, router callback, or another task runs it once with the
					supplied arguments.
				</p>
				<ul>
					<li>
						<code>refresh(this.state.revision)</code> tracks <code>revision</code>.
					</li>
					<li>
						A defaulted ordinary parameter captures an untracked snapshot once per generation.
					</li>
					<li>
						<code>task.peek(() =&gt; value)</code> handles conditional or mid-body snapshots.
					</li>
					<li>
						For a task function with an authored <code>TaskContext</code> parameter, call arguments
						define which changes start a new run. Reads inside the task body do not add activation
						inputs.
					</li>
				</ul>
				<p>
					A reactive default on a non-context task parameter is sampled once for every generation
					without subscribing the task to that read. The resolved parameter is an ordinary stable
					value throughout the body and after <code>await</code>.
				</p>
				<CodeBlock
					source={taskSources.capturedInputSource}
					language="tsx"
					title="Excerpt: track a revision and capture the draft"
				/>
				<p>
					Changing <code>draft</code> alone does not reactivate this task. When
					<code>revision</code> changes, the next generation captures the latest draft. An explicit
					argument remains normally tracked and replaces the default. Server tasks resolve the
					capture before dispatch and apply the usual serialization and data-policy checks. For a
					snapshot taken conditionally or later in the function, you can use{' '}
					<code>task.peek()</code>.
				</p>
			</details>
			<details>
				<summary>Placement, priority, and loading content</summary>
				<p>
					These settings answer different questions. <code>client()</code> and <code>server()</code>
					choose where a task runs. Without either, eXact infers placement from the resources the
					task uses.
					<code>immediate()</code>, <code>normal()</code>, and <code>deferred()</code> choose when
					eligible work runs. Normal priority is the default for invoked tasks.
				</p>
				<p>
					A <code>Suspense</code> boundary displays fallback content while blocking work beneath it
					is pending. <code>blocking()</code> and <code>nonblocking()</code> let you choose whether
					a task holds that boundary. Both still report pending status. Awaiting a task does not
					override its explicit loading policy.
				</p>
				<CodeBlock
					source={taskSources.readinessSource}
					language="tsx"
					title="Excerpt: checkout data and recommendations"
				/>
				<p>
					Here checkout data holds the loading boundary, while recommendations can finish later. An
					async component that awaits a value into <code>this.state</code> also creates blocking
					work. The <a href="#/learn/async-interfaces">loading interfaces guide</a> explains
					Suspense and paused views.
				</p>
				<p>
					<code>server().deferred()</code> gives server work deferred priority. The task still
					belongs to the request and remains subject to cancellation, deadlines, and hosting limits.
					It can be blocking or nonblocking. Streaming and proxy buffering control when output
					arrives, independently of priority. See <a href="#/runtimes">deployment requirements</a>.
				</p>
				<p>
					A client-only task reports idle status during SSR. Its body runs in the browser, where its
					status reflects client calls after hydration.
				</p>
			</details>
			<details>
				<summary>Results, child tasks, and failures</summary>
				<p>
					A task can update state and also return a value. Awaiting its call lets the caller use the
					returned value and handle failure with ordinary <code>try</code>/<code>catch</code>. When
					an event handler assigns that result to state, the assignment belongs to the handler.
					Different callers can use the same task result in different ways, including when the task
					runs on the server.
				</p>
				<CodeBlock
					source={taskSources.effectsAndResultsSource}
					language="tsx"
					title="Excerpt: update state and return a count"
				/>
				<p>
					A task called by another task belongs to that parent run. The parent waits for its child
					tasks and their cleanup even when it does not await their results. An unhandled child
					failure fails the parent. Adding <code>.catch()</code> can handle that failure without
					changing ownership. Cancellation travels from parent to children.
				</p>
				<p>
					For work that must not delay its caller, <code>detached()</code> removes that parent
					attachment. The task still has a component owner. Removing the component still cancels it.
				</p>
				<p>
					These rules also apply to server tasks. Detected disconnection cancels request-owned work.
					Expected cancellation does not produce an invocation-error log. Application failures still
					do. SSR waits for attached work and cleanup before publishing its output.
				</p>
				<p>
					When concurrent branches write state, each branch can be a child task that awaits its own
					external result. eXact then protects its state writes from cancelled runs.
				</p>
			</details>
			<details>
				<summary>State updates through helpers</summary>
				<p>
					Imported helpers can mutate passed state when eXact can follow the named argument paths.
					For opaque helpers or recursive traversal, returning data and assigning a named state
					field inside the task makes the update visible to the compiler. Server-side Map and Set
					mutations must occur directly in the task so their ordered changes can be recorded.
				</p>
				<p>
					The{' '}
					<a href="https://github.com/techjoshua/exact/blob/main/docs/tasks.md">task reference</a>
					describes supported mutation paths, scheduling, ownership, and cancellation in detail.
				</p>
			</details>
			<details>
				<summary>Tasks in a paused component</summary>
				<p>
					While Activity pauses a component, successful awaits and source failures wait before
					running the component's continuation. Cancellation remains immediate and releases that
					wait. A late result from a cancelled task cannot reactivate its continuation. If the
					component pauses again before a queued continuation runs, that continuation waits again.
					Disposing the owner before a queued task starts cancels it without entering its body.
				</p>
			</details>
			<TaskProgress />
		</Article>
	);
}
