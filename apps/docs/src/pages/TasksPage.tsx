import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const taskSource = `function Search(this: Component<SearchState>) {
  this.state.query = '';
  this.state.results = [];

  this.task(async () => {
    // Inferred dependency: this read makes the task rerun when query changes.
    const query = this.state.query;

    if (!query) {
      // Effect: this is a write, so results is not a task dependency.
      this.state.results = [];
      return;
    }

    // Managed resource: the compiler connects fetch to the task's abort signal.
    const response = await fetch('/api/search?q=' + encodeURIComponent(query));

    // Effect: the write notifies reactive consumers of results. It does not
    // cause this task to rerun because the task never reads results.
    this.state.results = await response.json();
  });

  return () => <SearchView results={this.state.results} />;
}`;

const compiledTaskSource = `this.task(
  // Inferred dependency made explicit by the compiler.
  this.reactive(() => this.state.query),
  async (__exactDependency, { signal }) => {
    // The callback receives the captured value for this task generation.
    const query = __exactDependency;

    if (!query) {
      this.state.results = [];
      return;
    }

    // Managed cancellation made explicit by the compiler.
    const response = await fetch(
      '/api/search?q=' + encodeURIComponent(query),
      { signal }
    );

    this.state.results = await response.json();
  }
);`;

const ownedResourcesSource = `function LivePanel(this: Component<{}>) {
  this.task.client(() => {
    // The compiler supplies the task signal to cancellable calls.
    fetch('/api/snapshot');
    window.addEventListener('resize', measure);

    // Known resources are disposed with this task generation.
    const socket = new WebSocket('/events');       // close()
    const observer = new ResizeObserver(measure);  // disconnect()
    const timer = setInterval(refresh, 5_000);      // clearInterval()
    const subscription = store.subscribe(refresh); // unsubscribe()

    // Returning cleanup remains available for an unknown resource.
    const custom = openCustomChannel();
    return () => custom.release();
  });

  return () => <Dashboard />;
}`;

const placedTasksSource = `import { readFile } from 'node:fs/promises';

function ProjectPage(this: Component<ProjectState>) {
  // Inferred server: this task reaches a server-only import.
  this.task(async () => {
    this.state.title = await readFile('title.txt', 'utf8');
  });

  // Inferred client: this task reads a browser global.
  this.task(() => {
    this.state.width = window.innerWidth;
  });

  // Manual placement is for intent the compiler cannot prove.
  this.task.client(() => opaqueBrowserLibrary.start());
  this.task.server(() => opaqueServerLibrary.warmCache());

  return () => <h1>{this.state.title}</h1>;
}`;

/** Documents inferred task generations, cancellation, cleanup, and placement. */
export function TasksPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Work follows the component"
			description="Tasks are setup declarations for work the component owns. The compiler turns state, prop, and context reads into rerun dependencies; reruns and unmounts cancel the previous generation."
			previous={{ path: '/learn/lists', label: 'Keyed lists' }}
			next={{ path: '/learn/server-execution', label: 'Server execution' }}
		>
			<section>
				<h2>Why tasks are a framework primitive</h2>
				<p>
					Async work creates ownership questions: which inputs make it stale, who cancels it, where
					is it allowed to run, and what resources must be released? eXact tasks answer those
					questions at component setup instead of scattering them across effects, controller
					variables, and unmount callbacks.
				</p>
			</section>
			<section>
				<h2>Write the task; let the compiler find its dependencies</h2>
				<p>
					The idiomatic form puts the work directly in <code>this.task()</code>. Exact state, prop,
					and reactive context reads inside a task become dependencies automatically. When one
					changes, eXact aborts the current generation, waits for registered cleanup as needed, and
					invokes the task again.
				</p>
				<CodeBlock source={taskSource} language="tsx" title="Search.tsx" />
				<p>
					The read of <code>this.state.query</code> is the dependency. Assignments to{' '}
					<code>this.state.results</code> are effects, not reads, so they do not make the task
					depend on <code>results</code> or create a rerun loop. Those writes still notify reactive
					consumers—including <code>SearchView</code>—and cause the affected interface expressions
					to update.
				</p>
				<p>
					The authored task does not need to request a signal. The compiler recognizes the fetch as
					cancellable and wires in the task generation's <code>AbortSignal</code>. Changing{' '}
					<code>query</code> therefore aborts the older fetch before a new request begins. The same
					signal aborts when the component unmounts, preventing a stale response from continuing as
					live component work.
				</p>
			</section>
			<section>
				<h2>What the compiler makes explicit</h2>
				<p>
					Conceptually, the compiler lowers the detected read into the explicit dependency form and
					connects its generated task signal to the fetch, as shown below. You can still author the
					explicit dependency form when a dependency must be supplied indirectly, or accept{' '}
					<code>{'{ signal }'}</code> yourself when passing it to an API the compiler cannot
					recognize. Each invocation receives the values captured for that generation, including
					after an <code>await</code>. Ordinary component code should prefer the simpler inferred
					form.
				</p>
				<CodeBlock source={compiledTaskSource} language="tsx" title="Conceptual compiler output" />
			</section>
			<section>
				<h2>The compiler also looks for owned resources</h2>
				<p>
					Task analysis recognizes cancellable calls and values with known disposal protocols. It
					can combine the task's <code>AbortSignal</code> with a fetch or listener call, clear
					timers, disconnect observers, close sockets and channels, terminate workers, unsubscribe
					subscriptions, and invoke
					<code>Symbol.dispose</code> or <code>Symbol.asyncDispose</code>.
				</p>
				<CodeBlock source={ownedResourcesSource} language="tsx" title="LivePanel.tsx" />
				<p>
					Ownership is generation-scoped, not merely component-scoped: a rerun disposes resources
					from the previous inputs before creating replacements. If a resource escapes into
					component state or the compiler cannot preserve its expression result safely, compilation
					asks you to move it or dispose it explicitly rather than pretending ownership is solved.
				</p>
			</section>
			<section>
				<h2>Server and client placement is useful, not mysterious</h2>
				<p>
					In a split build, the compiler follows effects through task calls. Browser globals and
					browser-only APIs select the client. Server-only imports select the server.
					Environment-neutral state-writing work can be isomorphic so server rendering may run it
					and hydration can avoid duplicating initial work.
				</p>
				<CodeBlock source={placedTasksSource} language="tsx" title="ProjectPage.tsx" />
				<p>
					Explicit placement is not a discouraged last resort. It is the correct declaration when an
					opaque library hides its environment behavior or when architecture requires a specific
					side. The compiler still checks for contradictions, such as a server task that references{' '}
					<code>window</code>.
				</p>
			</section>
		</Article>
	);
}
