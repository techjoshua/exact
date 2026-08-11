import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';
import { TaskIntroduction } from './TaskIntroduction.jsx';
import { taskSources } from './task-sources.js';

/** Documents function-defined tasks, structured lifetime, policy, and the public task ABI. */
export function TasksPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Tasks: dependencies, scheduling, and Suspense"
			description="Understand how eXact turns ordinary functions into owned, scheduled work—then control activation, dependencies, concurrency, priority, placement, and Suspense readiness."
			previous={{ path: '/learn/state', label: 'State & derived values' }}
			next={{ path: '/learn/compiler-tour', label: 'Inside the compiler' }}
		>
			<TaskIntroduction />
			<section>
				<h2>Start with an ordinary function</h2>
				<CodeBlock source={taskSources.inferredTaskSource} language="tsx" title="DraftEditor.tsx" />
				<p>
					There is no task registration API in this example. The compiler sees the browser storage
					effect and classifies <code>persistDraft</code> as client work. Its setup-scope call is
					both an initial activation and a reactive declaration. Reading
					<code>this.state.draft</code> while evaluating the argument makes that state the
					activation dependency.
				</p>
				<p>
					Each later draft change creates a new reactive generation and supersedes the previous one.
					If the same function were called from a click handler, the call would instead create an
					invoked generation for that interaction. Calling a task from another task attaches a child
					generation automatically. The source remains ordinary function calls; the compiler
					supplies the ownership and scheduling machinery.
				</p>
				<p>
					The repository&apos;s native sample applications follow this same rule: known storage,
					timer, listener, and DOM APIs infer client work and cancellation; reactive setup calls
					infer latest-wins activation; and ordinary child calls infer parallel invocation. They
					author <code>TaskContext</code> only for an environment boundary, a non-default policy, or
					an opaque capability the compiler cannot discover.
				</p>
				<p>
					A setup call whose value initializes a local synchronously remains ordinary JavaScript.
					Factories, context lookups, and similar helpers must return that value directly, so the
					compiler does not reinterpret them as inferred task activations. Awaited work can still be
					a task, and an authored final <code>TaskContext</code> remains explicit.
				</p>
				<p>
					When one synchronous task transition invalidates many reactive bindings, those reactions
					share one structural consequence frame. Cancellation and settlement still include the
					whole update, while independently meaningful work started by a reaction—such as presence
					leave motion—keeps its own child frame.
				</p>
				<Callout title="Async is not the marker">
					<p>
						A function does not become a task merely because it is <code>async</code>, and a task
						does not have to be asynchronous. Coordination needs—not promise syntax—are what make
						the function a task.
					</p>
				</Callout>
			</section>
			<section>
				<h2>The compiler wires discoverable cancellation and ownership</h2>
				<p>
					Every generation already has an <code>AbortSignal</code>. When a call&apos;s TypeScript
					signature exposes an optional direct <code>AbortSignal</code> parameter or an options
					parameter with <code>signal?: AbortSignal</code>, the compiler can supply the generation
					signal automatically. Built-in <code>fetch()</code> and <code>addEventListener()</code>
					are recognized directly. If source already provides a signal or event options, eXact
					combines or extends them rather than silently replacing them.
				</p>
				<CodeBlock
					source={taskSources.inferredLifetimeSource}
					language="tsx"
					title="FeedConnection.tsx"
				/>
				<p>
					The compiler also owns resources whose cleanup protocol and lifetime are visible. This
					includes timers, animation and idle callbacks, observers, sockets, workers, subscription
					results with a callable cleanup or <code>unsubscribe()</code>/<code>dispose()</code>, and
					local <code>Disposable</code> or <code>AsyncDisposable</code> values. It releases them
					when the generation settles or is cancelled.
				</p>
				<p>
					Automatic ownership is deliberately conservative. The resource must stay local to the
					generation, and its disposal contract must be discoverable from a known API, its return
					type, or an eXact ownership annotation. If a resource escapes, the compiler reports a
					diagnostic instead of guessing its lifetime.
				</p>
				<Callout title="Use TaskContext at opaque boundaries">
					<p>
						Pass <code>task.signal</code> when a wrapper hides its cancellable signature. Use
						<code>task.cleanup()</code> for an opaque cleanup callback and <code>task.own()</code>
						for a disposable value the compiler cannot associate safely. The language tools show
						recognized signal injection and owned resources, so inferred lifetime is inspectable.
					</p>
				</Callout>
			</section>
			<section>
				<h2>TaskContext makes policy and capabilities explicit</h2>
				<p>
					Most tasks should begin without an explicit context. Add a final <code>TaskContext</code>
					parameter when the compiler cannot infer an architectural choice, when you want to
					override a default, or when the body needs a generation capability such as cancellation,
					optimistic state, cleanup, owned disposal, or an untracked read.
				</p>
				<CodeBlock source={taskSources.reactiveTaskSource} language="tsx" title="Search.tsx" />
				<p>
					The final declaration has two distinct jobs. Inside the function, <code>task</code> is the
					real context for the current generation, which is why the request can use
					<code>task.signal</code>. In the parameter default, the chain rooted at the imported
					<code>TaskContext</code> value is <strong>declarative compiler syntax</strong>. Here it
					states that the work belongs on the client.
				</p>
				<p>
					Application code never supplies that final argument. The compiler recognizes and validates
					the default expression, records its policy on the generated task definition, erases the
					policy builder from emitted application code, and supplies a fresh runtime context
					whenever a generation starts. A lookalike object or an ordinary default parameter does not
					receive this treatment.
				</p>
				<ul>
					<li>
						Use <code>client()</code> or <code>server()</code> when placement should be explicit.
					</li>
					<li>
						Use <code>parallel()</code>, <code>latest()</code>, <code>queue()</code>, or
						<code>key(value)</code> to control invoked concurrency.
					</li>
					<li>
						Use <code>immediate()</code>, <code>normal()</code>, or <code>deferred()</code> to
						declare priority.
					</li>
					<li>
						Use <code>blocking()</code> or <code>nonblocking()</code> to make Suspense readiness
						explicit, and <code>detached()</code> only to opt out of structural attachment.
					</li>
				</ul>
				<p>
					Without those modifiers, placement and readiness are inferred, invoked generations run in
					parallel at normal priority, reactive generations are latest-wins, and child work attaches
					to its ambient task. The <code>query</code> argument in this example is the reactive
					input; a changed query supersedes the prior generation.
				</p>
			</section>
			<section>
				<h2>Dependencies come from activation</h2>
				<p>
					A setup call is a subscription declaration. Reactive argument expressions at that call
					site are tracked dependencies. When one changes, eXact cancels the previous reactive
					generation and starts a new one. A call from a click, submit, router, lifecycle callback,
					or another task is an invocation instead: its arguments are values for that invocation,
					not a new standing subscription.
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
						For a task function with an authored <code>TaskContext</code> parameter, call
						arguments—not incidental body reads—define the reactive activation edge.
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
					title="captured-task-input.tsx"
				/>
				<p>
					Changing <code>draft</code> alone does not reactivate this task. When
					<code>revision</code> changes, the next generation captures the latest draft. An explicit
					argument remains normally tracked and replaces the default. Server tasks resolve the
					capture before dispatch and apply the usual serialization and data-policy checks. Use
					<code>task.peek()</code> for conditional or mid-body snapshots.
				</p>
			</section>
			<section>
				<h2>Scheduling is several independent choices</h2>
				<p>
					An activation creates a generation and submits it to the scheduler. The component owner,
					stable task definition, and optional key select its lane. Concurrency determines whether
					it can overlap another generation in that lane; priority determines when eligible work
					runs; placement determines which runtime executes it; and readiness determines whether
					Suspense waits. These choices compose, but they do not mean the same thing.
				</p>
				<p>
					The default on the final context parameter is where explicit scheduling policy is written.
					Placement, concurrency, priority, readiness, keys, and detachment compose in the compiler
					syntax. The compiler erases the builder and supplies a fresh context for every generation.
				</p>
				<CodeBlock
					source={taskSources.schedulingSource}
					language="tsx"
					title="Scheduled save task"
				/>
				<ul>
					<li>
						<strong>Concurrency:</strong> <code>parallel()</code> overlaps invoked generations,
						<code>latest()</code> supersedes the previous one, and <code>queue()</code> preserves
						order. <code>key(value)</code> creates an independent lane per key. Reactive activations
						always supersede their prior generation.
					</li>
					<li>
						<strong>Priority:</strong> <code>immediate()</code>, <code>normal()</code>, and
						<code>deferred()</code> determine when eligible work runs. DOM interactions begin at
						interactive priority.
					</li>
					<li>
						<strong>Readiness:</strong> <code>blocking()</code> participates in the nearest Suspense
						boundary; <code>nonblocking()</code> remains owned without holding that boundary.
					</li>
					<li>
						<strong>Placement and lifetime:</strong> <code>client()</code> and <code>server()</code>
						constrain execution. Children attach structurally unless <code>detached()</code> is
						deliberate.
					</li>
				</ul>
				<p>
					The callable facade&apos;s status is aggregate. With keyed concurrency,
					<code>saveDocument.pending</code> is true when any foreground lane owned by this component
					is pending, and <code>pendingCount</code> is the total across those lanes. That makes the
					example&apos;s message a task-wide indicator rather than status for the currently selected
					document.
				</p>
			</section>
			<section>
				<h2>Async, await, and Suspense are different decisions</h2>
				<p>
					<code>async</code> is JavaScript syntax: it permits <code>await</code> and makes the
					function return a promise. It does not by itself select task readiness or show a Suspense
					fallback. <code>await</code> is a suspension point inside an eXact task: the generation
					stays pending, its continuation retains cancellation and ownership, and later state writes
					are fenced against stale generations.
				</p>
				<p>
					Suspense waits only for a <strong>blocking task generation</strong> owned by a descendant
					of that boundary. A nonblocking task may await for a long time without showing the
					fallback. Conversely, a blocking task can hold readiness through an attached child or a
					returned promise even if the parent body contains no authored <code>await</code>.
				</p>
				<CodeBlock
					source={taskSources.readinessSource}
					language="tsx"
					title="Blocking and background work"
				/>
				<Callout title="The async-component shorthand">
					<p>
						When an <code>async</code> component directly awaits a value into
						<code>this.state</code>, eXact lowers that setup continuation into inferred blocking
						work. That is a compiler convenience for component readiness—not a rule that every async
						function suspends every boundary. Use a task function with an explicit
						<code>TaskContext</code> policy when readiness, placement, or scheduling should be
						visible in source.
					</p>
				</Callout>
			</section>
			<section>
				<h2>Status and capabilities share one context</h2>
				<CodeBlock
					source={taskSources.invokedTaskSource}
					language="tsx"
					title="ProfileEditor.tsx"
				/>
				<p>
					Direct calls use ordinary function syntax. When status is observed, the compiler
					materializes an owner-bound facade with <code>pending</code>, <code>pendingCount</code>,
					<code>generation</code>, <code>result</code>, <code>error</code>, and
					<code>cancel()</code>. Optimistic mutation is synchronous and rolls back if its generation
					fails or is superseded.
				</p>
				<CodeBlock
					source={taskSources.keyedStatusSource}
					language="tsx"
					title="Status for one keyed lane"
				/>
				<p>
					Use <code>taskStatus(task, {'{ key }'})</code> in the outer component definition when the
					UI needs one lane. Its <code>pending</code>, <code>pendingCount</code>,
					<code>generation</code>, <code>result</code>, <code>error</code>, and{' '}
					<code>cancel()</code>
					are scoped to that key. The key must match the value produced by the task&apos;s
					<code>key(...)</code> policy.
				</p>
				<p>
					A status view captures its key when initialization creates it; it is not a dynamic “most
					recently invoked key” selector. For a dynamic list, prefer defining the save task inside
					each keyed row component so the durable component owner naturally gives every row its own
					<code>save.pending</code>. Use keyed lanes when one owner genuinely coordinates work for
					several stable keys.
				</p>
				<p>
					Each generation&apos;s <code>TaskContext</code> also provides its abort signal, generation
					number, activation kind, snapshots, optimistic mutation, cleanup registration, and
					disposable ownership. Application code never constructs or passes that final argument.
				</p>
			</section>
			<section>
				<h2>Effects and results are separate</h2>
				<CodeBlock
					source={taskSources.effectsAndResultsSource}
					language="tsx"
					title="SearchIndex.tsx"
				/>
				<p>
					A task&apos;s <strong>effects</strong> are the work its generation performs or publishes:
					state, context, or DOM changes; optimistic writes; external I/O; and owned resources or
					cleanup. Its <strong>result</strong> is the fulfillment value or rejection exposed by the
					invocation. Ignoring that result does not cancel the task, discard its effects, or detach
					it from its structural parent.
				</p>
				<p>
					<code>await child()</code> observes the result, sequences the caller, and routes rejection
					through ordinary <code>try</code>/<code>catch</code>. <code>void child()</code> leaves the
					result edge unobserved: the child still runs and the parent still waits for it, but an
					unhandled rejection fails the structural parent. Adding <code>.catch()</code> observes and
					can recover that result without changing attachment.
				</p>
				<Callout title="Await does not authorize effects or control Suspense">
					<p>
						The compiler fences staged framework effects so cancelled or stale generations cannot
						publish them. External effects cannot be rolled back automatically, so pass
						<code>task.signal</code> and register cleanup where appropriate. Separately, a
						task&apos;s <code>blocking()</code> or <code>nonblocking()</code> readiness policy—not
						whether a caller awaits its result—determines whether Suspense waits.
					</p>
				</Callout>
			</section>
			<section>
				<h2>Children settle structurally</h2>
				<p>
					A task called by another task attaches automatically. The parent cannot structurally
					settle until attached descendants and their cleanup finish, even when it does not await a
					child result. Awaiting still coordinates values and catches failures through ordinary
					JavaScript control flow. <code>detached()</code> is the explicit escape hatch for owned
					work that must not delay its causal parent.
				</p>
				<p>
					Cancellation travels down the tree. Cleanup runs child-first and last-in-first-out within
					a frame. Use <code>task.cleanup()</code> for callbacks and <code>task.own()</code> for
					disposable resources.
				</p>
				<Callout title="Cleanup follows the generation, not just the component">
					<p>
						A synchronous task that registers cleanup and then returns runs that cleanup immediately
						as the generation settles. Keep the task pending for the resource&apos;s intended
						lifetime. For repeatable effects driven by reactive state—such as scrolling after a
						route-location change—prefer a reactive activation over a manual subscription.
					</p>
				</Callout>
				<p>
					When concurrent branches publish component state, define them as child task functions and
					await the external result inside each child. Compiler-lowered awaits and staged writes
					already fence superseded generations, so component revision comparisons and post-await
					<code>task.signal.aborted</code> checks only duplicate framework behavior.
				</p>
				<CodeBlock
					source={taskSources.ownedResourcesSource}
					language="tsx"
					title="socket-task.ts"
				/>
				<p>
					Server continuations run through the same frame contract. Their trusted
					<code>TaskContext</code> carries request cancellation, generation, cleanup, ownership, and
					attached-child settlement without serializing task authority through the browser.
				</p>
			</section>
			<section>
				<h2>Compilerless libraries use the same runtime</h2>
				<p>
					Published libraries and adapters can import the versioned
					<code>@exactjs/core/tasks/v1</code> ABI. <code>defineTask()</code> creates a stable
					definition, <code>bindTask()</code> captures durable ownership, and
					<code>createTaskOwner()</code> makes an explicit lifetime for cross-root concurrency.
				</p>
				<CodeBlock source={taskSources.librarySource} language="ts" title="catalog-task.ts" />
				<p>
					Explicit owners are async-disposable: disposal cancels their queued and active generations
					and waits for structural cleanup. Framework packages use the narrower opaque frame SPI at
					<code>@exactjs/core/framework/task-frames</code>. Its executions are cancelable:
					cancellation aborts attached descendants and reports completion only after their
					cooperative cleanup. Structural finalizers remain attached to the parent task, while
					semantic frame kinds and human labels remain visible to inspection tools.
				</p>
			</section>
		</Article>
	);
}
