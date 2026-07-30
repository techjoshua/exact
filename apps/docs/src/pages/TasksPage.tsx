import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const reactiveTaskSource = `import { TaskContext } from '@exactjs/core';

function Search(this: Component<SearchState>) {
  this.state.query = '';
  this.state.results = [];

  async function search(
    query: string,
    task: TaskContext = TaskContext.client().latest()
  ) {
    if (!query) {
      this.state.results = [];
      return;
    }
    const response = await fetch('/api/search?q=' + encodeURIComponent(query), {
      signal: task.signal
    });
    this.state.results = await response.json();
  }

  // Initialization plus reactive activation when query changes.
  search(this.state.query);

  return () => <SearchView results={this.state.results} />;
}`;

const capturedInputSource = `async function refreshRates(
  revision: number,
  draft: ShipmentDraft = this.state.draft,
  task: TaskContext = TaskContext.client().latest()
) {
  await loadRates(revision, draft, task.signal);
}

// revision is tracked; draft is sampled for each resulting generation.
refreshRates(this.state.revision);`;

const invokedTaskSource = `async function save(
  profile: Profile,
  task: TaskContext = TaskContext.server().latest().immediate()
) {
  task.optimistic(() => {
    this.state.profile = profile;
  });
  this.state.profile = await repository.save(profile, task.signal);
}

return () => (
  <button disabled={save.pending} onClick={() => save(this.state.profile)}>
    {save.pending ? 'Saving…' : 'Save'}
  </button>
);`;

const ownedResourcesSource = `async function watch(
  url: string,
  task: TaskContext = TaskContext.client()
) {
  const socket = task.own(new ManagedSocket(url));
  const unsubscribe = socket.subscribe(receiveMessage);
  task.cleanup(unsubscribe);
  return socket.ready;
}`;

const librarySource = `import {
  createTaskOwner,
  defineTask,
  bindTask
} from '@exactjs/core/tasks/v1';

const owner = createTaskOwner({ label: 'catalog session' });
const search = bindTask(
  defineTask(
    { concurrency: 'latest', priority: 'deferred' },
    async (query: string, task) => catalog.search(query, task.signal)
  ),
  { owner }
);

const results = await search(query);
await owner[Symbol.asyncDispose]();`;

/** Documents function-defined tasks, structured lifetime, policy, and the public task ABI. */
export function TasksPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Ordinary functions become structured tasks"
			description="eXact infers coordinated work from ordinary functions and activation sites. One task tree owns invocation, reactivity, cancellation, cleanup, optimism, and client/server placement."
			previous={{ path: '/learn/component-registries', label: 'Component registries' }}
			next={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
		>
			<section>
				<h2>Define work as a local function</h2>
				<p>
					A function becomes a task when its effects, host, placement, capabilities, or final{' '}
					<code>TaskContext</code> parameter require coordinated work. A setup-scope call declares
					initialization and reactive activation; a call from an event, form, router, lifecycle, or
					another task is an invocation.
				</p>
				<CodeBlock source={reactiveTaskSource} language="tsx" title="Search.tsx" />
				<p>
					The argument expression is the reactive input. A changed query supersedes the prior
					generation. Pure helpers remain ordinary JavaScript, and an async function is not remotely
					callable merely because it is async.
				</p>
			</section>
			<section>
				<h2>Capture stable generation inputs with defaults</h2>
				<p>
					A reactive default on a non-context task parameter is sampled once for every generation
					without subscribing the task to that read. The resolved parameter is an ordinary stable
					value throughout the body and after <code>await</code>.
				</p>
				<CodeBlock source={capturedInputSource} language="tsx" title="captured-task-input.tsx" />
				<p>
					Changing <code>draft</code> alone does not reactivate this task. When{' '}
					<code>revision</code> changes, the next generation captures the latest draft. An explicit
					argument remains normally tracked and replaces the default. Server tasks resolve the
					capture before dispatch and apply the usual serialization and data-policy checks. Use{' '}
					<code>task.peek()</code> for conditional or mid-body snapshots.
				</p>
			</section>
			<section>
				<h2>Policy and capabilities share one context</h2>
				<p>
					The default on the final context parameter is declarative compiler syntax. Placement,
					concurrency, priority, readiness, keys, and detachment compose there. The compiler erases
					the builder and supplies a fresh context for every generation.
				</p>
				<CodeBlock source={invokedTaskSource} language="tsx" title="ProfileEditor.tsx" />
				<p>
					Direct calls use ordinary function syntax. When status is observed, the compiler
					materializes an owner-bound facade with <code>pending</code>, <code>pendingCount</code>,{' '}
					<code>generation</code>, <code>result</code>, <code>error</code>, and{' '}
					<code>cancel()</code>. Optimistic mutation is synchronous and rolls back if its generation
					fails or is superseded.
				</p>
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
				<CodeBlock source={ownedResourcesSource} language="tsx" title="socket-task.ts" />
				<p>
					Server continuations run through the same frame contract. Their trusted{' '}
					<code>TaskContext</code> carries request cancellation, generation, cleanup, ownership, and
					attached-child settlement without serializing task authority through the browser.
				</p>
			</section>
			<section>
				<h2>Compilerless libraries use the same runtime</h2>
				<p>
					Published libraries and adapters can import the versioned{' '}
					<code>@exactjs/core/tasks/v1</code> ABI. <code>defineTask()</code> creates a stable
					definition, <code>bindTask()</code> captures durable ownership, and{' '}
					<code>createTaskOwner()</code> makes an explicit lifetime for cross-root concurrency.
				</p>
				<CodeBlock source={librarySource} language="ts" title="catalog-task.ts" />
				<p>
					Explicit owners are async-disposable: disposal cancels their queued and active generations
					and waits for structural cleanup. Framework packages use the narrower opaque frame SPI at{' '}
					<code>@exactjs/core/framework/task-frames</code>. Its executions are cancelable:
					cancellation aborts attached descendants and reports completion only after their
					cooperative cleanup.
				</p>
			</section>
		</Article>
	);
}
