import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { TaskHelperUpdates } from './TaskHelperUpdates.jsx';
import { TaskProgress } from './TaskProgress.jsx';
import { TaskResourceGuidance } from './TaskResourceGuidance.jsx';
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
					without passing that final argument. eXact supplies it. When setup schedules a shared module
					helper, the component owns that activation. Other callers can still invoke the exported
					helper normally.
				</p>
				<p>
					Reactive setup assignments keep independent ownership when statements are adjacent. Task
					bodies support ordinary destructuring and function or arrow helpers. When a helper needs
					context, read it on the component and pass the value or reactive handle. Parentheses and type-only
					annotations preserve helper state reads and placement requirements. Tasks support
					optional, defaulted, and destructured inputs, and authored overloads. A compatible tuple
					can be spread into a setup call. For variable-length inputs, pass one array to the task
					and use native rest or spread syntax inside an ordinary helper. Task inputs have fixed
					positions, so a task rest parameter produces a compiler error.
				</p>
				<p>
					When a task reads an optional value, ordinary JavaScript short-circuiting still applies.
					An expression such as <code>this.state.item?.name!.toUpperCase()</code> skips the chain
					when <code>item</code> is absent. TypeScript's non-null assertion adds no runtime check.
					Parentheses around the optional read end that chain, so
					<code>(this.state.item?.name)!.toUpperCase()</code> can throw for an absent value.
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
					Input changes and component removal cancel the work they replace or retire. For a Cancel
					button, call <code>search.cancel()</code> in its handler. Cancellation blocks further
					task-owned state updates. External work already performed, such as a database write,
					cannot be undone by cancelling the browser task.
				</p>
				<p>
					A current task can recover in <code>catch</code>. Cancellation blocks state writes in
					<code>catch</code> and <code>finally</code>. Cleanup retains props, attempts every
					callback, and releases resources while preserving an existing failure, including frozen
					errors and primitive values. A finished child stays settled after parent cancellation.
					Cancellation retains its reason. <code>isTaskCancellation()</code> from{' '}
					<code>@exactjs/core</code>
					distinguishes it from other errors named <code>AbortError</code>.
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
					cleanup. Completing that cleanup preserves the successful task result and any state
					updates waiting for publication. If a service returns a subscription number, you can
					register <code>task.cleanup(() =&gt; unsubscribe(number))</code> to release it even when
					the task is cancelled. A cancelled server task can still read its own submitted scalar state
					in cleanup. Its pending changes stay private to that invocation.
				</p>
				<TaskResourceGuidance />
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
					When a click starts a server task, the browser selects the queue before sending the
					request. Use a key the browser can compute, such as the document ID passed to the task.
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
					Define tasks in component setup. Share logic in helpers. Task values keep status in
					<code>{'{ child }'}</code> properties.
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
					if the save fails or is replaced. This capability belongs to the supplied task context.
					Ordinary helpers with the same name keep their usual execution placement. In a server
					task, call this capability directly in the task body through the context or a destructured
					binding. Its callback runs once on the client before dispatch and can use task inputs,
					outer public values, and its own local calculations. Locals
					declared in the server task body are unavailable to that callback and produce a compiler
					error. Put client-side conditions inside the callback.
				</p>
				<CodeBlock
					source={taskSources.optimisticTaskSource}
					language="tsx"
					title="Excerpt: optimistic profile save"
				/>
				<p>
					Here <code>draft</code> holds the edit and <code>profile</code> is displayed elsewhere.
					Rollback restores changes still owned by the task and preserves later confirmed writes.
					Pending array edits follow their entries through insertions, sorting, and reversal.
					Appending with <code>items[items.length] = value</code> and <code>items.push(value)</code>
					follows the same ownership rules. A later explicit length assignment remains
					authoritative. If overlapping saves both fail, rollback also removes the earlier failed
					edit. Clearing a Map or Set restores still-owned members while preserving later
					independent insertions. Your application decides how to explain a failed save.
				</p>
			</section>
			<details>
				<summary>Track selected inputs and capture other values</summary>
				<p>
					Calling a task in the component body observes its argument values, including props derived
					from nested parent state. When a value changes, eXact cancels the previous run and starts
					another. Calls from event handlers, lifecycle callbacks, router callbacks, or other tasks
					run once with their supplied arguments.
				</p>
				<p>
					Pass a callback as a prop when you want to reuse a button with a different action.
					One instance can invoke a server task while another updates local state. Each button
					binds its callback to a DOM click, and hydration installs both handlers on the existing
					elements. A render helper can also pass a callback to an event attribute. Invoke tasks
					during component setup or from an event handler.
				</p>
				<ul>
					<li>
						<code>refresh(this.state.revision)</code> tracks <code>revision</code>.
					</li>
					<li>
						A defaulted ordinary parameter captures an untracked snapshot once per generation.
					</li>
					<li>
						A task can close over a <code>const</code> initialized with <code>peek()</code> during
						setup. The task uses that value for every run. Changes to the source leave its
						reactive schedule unchanged.
					</li>
					<li>
						A task-local derived read can follow a pending edit made by the task. Use{' '}
						<code>task.peek(() =&gt; value)</code> when you need a conditional or mid-body snapshot.
					</li>
					<li>
						For a task function with an authored <code>TaskContext</code> parameter, call arguments
						choose the inputs that start new runs. An empty argument list declares one startup run.
						Body reads do not add activation inputs.
					</li>
				</ul>
				<p>
					A reactive default on a non-context task parameter is sampled once for every generation
					without subscribing the task to that read. The resolved parameter is an ordinary stable
					value throughout the body and after <code>await</code>.
				</p>
				<p>
					Captured values keep their TypeScript constraints. Narrow nullable or union values before
					using them, respect readonly properties, and pass arguments accepted by captured
					callbacks. Computed state reads evaluate their keys inside the task, preserving local
					variables and ordinary evaluation order. Local class instances retain their private method
					receivers and ordinary optional-call behavior inside task work.
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
				<p>
					Send data from a client event by calling <code>save(document.title)</code>. Passing
					<code>{'save(() => document.title)'}</code> sends a function and produces a compiler error
					even if the server ignores that parameter. To run client code when the task finishes,
					await its result and call your function locally. A server task can read a data prop such
					as <code>props.title</code>. If a prop supplies a callback, run it on the client and pass
					its data. If a task returns an object with a custom <code>then</code> getter or method,
					that code must also be able to run on the task’s target, even when the caller ignores
					the result.
				</p>
				<p>
					A server task can pass a captured prop to a helper and assign the result to
					<code>this.state</code>. A direct <code>this.getContext(Token)</code> read in the task
					body uses the server context for the render or task request, including when the task
					works with collections in state. A server-owned context read in a parameter default is
					rejected because capture happens before dispatch. A shared context used only by a default
					is passed as the captured value.
					If the body also reads the context, the executor receives one shared context binding.
					To publish shared context updates to descendants, establish the provider during component
					setup and update it inside the task.
				</p>
				<p>
					Apply the same rule to inherited getters and methods. If a task reads a getter or
					calls a method that uses <code>window</code>, keep that operation on the client.
				</p>
				<p>
					Reading a property descriptor on an ordinary object leaves its stored getter or callback
					dormant. If the task later calls that function, keep the call on the client when the
					function uses browser globals. This applies to <code>call</code>, <code>apply</code>,
					<code>Reflect.apply</code>, and calls to functions created with <code>bind</code>.
					If a local conditional chooses between callbacks, consider the placement needs of each
					possible callback.
				</p>
				<p>
					With <code>Reflect.apply</code>, check what the callback reads on arguments before a
					spread. Both forms of <code>apply</code> can also run authored code when JavaScript
					reads an array-like argument list’s <code>length</code> and converts it to a number.
					Keep the call on the client if a callback or conversion hook that can run uses
					browser globals.
				</p>
				<p>
					The returned record has its own property lookup. If code installs an inherited getter on
					that record's prototype, reading the record can invoke it. An own data field takes
					precedence, and an optional read skips the lookup when the descriptor is absent.
				</p>
				<p>
					A call to <code>Object.getOwnPropertyDescriptor</code> on a proxy can run its
					descriptor trap and getters on the descriptor it returns. Keep the call on the client if
					that code uses browser globals.
				</p>
				<p>
					Call a helper on the client if it uses a value initialized from the browser. Then pass
					the needed data to the server task.
				</p>
				<p>
					A helper can update a plain object through its getters and setters. To send that result
					back to the client, assign it to a state field in the task, for example
					<code>this.state.value = apply(input).value</code>. A task can also pass an object literal
					with a field initialized to <code>this.state</code>. If its setter assigns a named scalar
					through that field, the next task read sees the change and the response includes the
					updated state.
				</p>
				<p>
					Server collection mutations require a known Array, Map, or Set type. An
					<code>any</code> or <code>unknown</code> receiver cannot describe a safe published edit.
					Preserve the collection type or assign its enclosing state value. Nullable containers can
					use an ordinary guard inside the task body.
				</p>
			</details>
			<details>
				<summary>Placement, priority, and loading content</summary>
				<p>
					These settings answer different questions. <code>client()</code> and <code>server()</code>
					choose where a task runs. Without either, eXact infers placement from the resources the
					task uses. When the compiler can trace a callback, invoking it contributes the resources
					its body uses. This includes calling a getter saved into a local constant from a property
					descriptor.
				</p>
				<p>
					A Promise executor contributes its resource use when the Promise is constructed.
					A call through a saved resolver can reach a thenable's getter or method. Calling an
					own <code>call</code> or <code>apply</code> method assigned to the resolver contributes
					the resources used by that method.
				</p>
				<p>
					A direct <code>Object.defineProperty</code> call on a fresh empty object adds no
					platform requirement when the result is unused, the key is a literal, and the descriptor
					uses plain properties such as <code>{'{ value: 2 }'}</code>. Argument evaluation,
					including class static initialization, and any authored descriptor getters still contribute
					the resources they use.
					A literal lane key such as <code>key("search")</code> adds no platform requirement.
					A button can call a server task with <code>key(location.pathname)</code> because the
					browser selects the lane before dispatch. Use an argument like a document ID when
					callers on both targets need to select the same lane.
					The same rule applies when a parent imports the component that owns the task.
					Caching an object does not remove the resource requirements of getters read
					through references to that shared object. Freezing an object also preserves its getters
					and setters, including the resources they use when you read or assign its properties. An
					array callback that reads an element's getter also keeps that getter's resource
					requirements. A closure that reads a local object's getter has the same requirements.
					When an <code>Array.map()</code> callback indexes a captured object using a fixed array
					of keys, getters on entries outside that proven set add no placement requirement.
					Spreading an object into an array also reads its{' '}
					<code>Symbol.iterator</code>
					property. If the object's getter writes <code>document.title</code>, the task needs the
					browser before iteration even begins. Creating a generator defers its body. If a task loops
					over that generator and its body reads the DOM, the task needs the browser. The same
					applies when an iterator reads the DOM while advancing or closing on early exit.
					When <code>for await</code> consumes a synchronous iterator, it also awaits the value
					supplied with each step.
					Placement follows captured inputs and current
					assignments through helper returns, preserving ordinary JavaScript initialization and
					thrown errors. Unresolved callbacks or externally supplied values can leave placement
					uncertain.
				</p>
				<p>
					An <code>await</code> in a task keeps its ordinary TypeScript result type. If
					<code>loadLabel()</code> resolves to a string, then
					<code>await (enabled &amp;&amp; loadLabel())</code> can produce
					<code>false</code> or a string.
				</p>
				<p>
					<code>immediate()</code>, <code>normal()</code>, and <code>deferred()</code> choose when
					eligible work runs. Normal priority is the default for invoked tasks.
				</p>
				<p>
					Returning an object from async work can invoke its <code>then</code> getter during
					JavaScript promise settlement. That getter's resource requirements also count toward task
					placement, including getters inherited from a prototype. An own <code>then</code> property
					masks an inherited getter. A <code>PromiseLike</code> type describes the result contract
					without making the getter free of effects. Giving foreign code access to a shared
					prototype leaves its settlement behavior uncertain, including when that prototype is
					passed inside another object.
				</p>
				<p>
					A <code>Suspense</code> boundary displays fallback content while blocking work beneath it
					is pending. <code>blocking()</code> and <code>nonblocking()</code> let you choose whether
					a task holds that boundary. Both still report pending status. Awaiting a task does not
					override its explicit loading policy.
				</p>
				<p>
					A nonblocking initialization task can still be pending when the server renders the page.
					The browser can start that task after adopting the server HTML. If the server has already
					published the task's successful result, hydration uses the result and skips that initial
					run.
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
					Suspense and paused views. Store awaited values the view needs in <code>this.state</code>.
					An intermediate local inside managed setup work cannot escape into the view before that
					work settles. A view callback can still declare its own parameter or local with the same
					name.
				</p>
				<p>
					<code>server().deferred()</code> gives server work deferred priority. The task still
					belongs to the request and remains subject to cancellation, deadlines, and hosting limits.
					It can be blocking or nonblocking. Streaming and proxy buffering control when output
					arrives, independently of priority. See <a href="#/runtimes">deployment requirements</a>.
				</p>
				<p>
					A client-only task reports idle status during SSR. Its body runs in the browser, where its
					status reflects client calls after hydration. Promise constructor getters installed by a
					client-only task contribute to browser task placement. Server work uses the effects of
					possible writes on the server.
				</p>
				<p>
					An invoked server task can publish a computed value by assigning it to component state,
					for example <code>this.state.counter.value = calculateNext(this.state.counter.value)</code>.
					A returned getter that writes through a captured state parameter produces <code>EXACT2001</code>.
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
				<p>
					During component setup, a direct state-field assignment from a task with an explicit
					policy declares an output that receives the task's settled returned value. Reactive call
					arguments rerun the activation and update the field. The assignment belongs to this setup
					caller, even when an event also calls the same task. Replaced or disposed client runs
					cannot publish a late result. Local aliases and statically selected task-table members,
					including destructured members, retain the same task identity.
				</p>
				<CodeBlock
					source={taskSources.effectsAndResultsSource}
					language="tsx"
					title="Excerpt: update state and return a count"
				/>
				<p>
					Parents await children and cleanup, including timers owned while the parent body is
					pending. A browser parent can await a server child that calls a server-only helper, then
					use its result in the browser. The parent evaluates the arguments, including any getters,
					before dispatch. Cancellation reaches children and fences late writes. Unhandled child
					failure fails the parent.
					<code>.catch()</code> handles it in the same owner. Caller cancellation and inherited
					native option accessors apply. Children may await external results before state writes.
				</p>
				<p>
					<code>detached()</code> lets work settle independently of its parent. Component removal
					still cancels it, including on the server. Detected disconnection cancels request-owned
					work. Expected cancellation produces no invocation-error log. Application failures do. SSR
					waits for attached work and cleanup. It does not automatically wait for detached work.
					Explicit <code>await</code> still delays the caller, without guaranteeing execution after
					the response. Writes performed by same-owner invoked tasks while the request remains open
					can enter its state response. Later writes do not. Warning <code>EXACT2004</code>{' '}
					identifies detached server task definitions. Acknowledge it with{' '}
					<code>{'/** @exact ignore=EXACT2004 */'}</code> immediately before the function or its
					owning variable declaration. This changes no execution or ownership and cannot hide
					errors.
				</p>
			</details>
			<TaskHelperUpdates />
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
