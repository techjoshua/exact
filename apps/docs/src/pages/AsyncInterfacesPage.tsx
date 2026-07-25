import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article, Callout } from './Article.jsx';

const awaitedTaskSource = `async function ShippingOptions(
  this: Component<ShippingState>
) {
  // destination is inferred as the rerun dependency. getOptions receives
  // the generation's AbortSignal when its signature accepts one.
  this.state.options = await this.task(
    () => getOptions(this.state.destination)
  );

  return () => <Options options={this.state.options} />;
}`;

const explicitTaskSource = `function ShippingOptions(
  this: Component<ShippingState>
) {
  this.task.blocking(
    this.reactive(() => this.state.destination),
    async (destination, { signal }) => {
      const options = await getOptions(destination, { signal });

      // Conceptually staged until this blocking generation commits.
      this.state.options = options;
    }
  );

  return () => <Options options={this.state.options} />;
}`;

const suspenseSource = `function Checkout(this: Component<{}>) {
  return () => (
    <Suspense fallback={<ShippingSkeleton />}>
      <ShippingOptions />
    </Suspense>
  );
}`;

const activitySource = `function Workspace(this: Component<{ tab: Tab }>) {
  return () => (
    <>
      <Activity mode={this.state.tab === 'editor' ? 'active' : 'parked'}>
        <Editor />
      </Activity>
      <Activity mode={this.state.tab === 'preview' ? 'active' : 'background'}>
        <Preview />
      </Activity>
    </>
  );
}`;

const schedulingSource = `// Normal owned work.
this.task(() => refreshStatus());

// Lower-priority preparation. Placement remains compiler-inferred.
this.task.deferred(() => precomputePreview(this.state.document));

// Unawaited work that deliberately blocks the nearest Suspense boundary.
this.task.blocking(async () => {
  this.state.catalog = await loadCatalog();
});

// Placement, priority, and readiness facets compose.
this.task.server.deferred.blocking(() => warmRecommendations());`;

/** Documents async component continuations, readiness, retention, and scheduling. */
export function AsyncInterfacesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Async work without async component lifetimes"
			description="Await tasks in ordinary TypeScript, coordinate readiness with Suspense, retain inactive mounted trees with Activity, and choose lower-priority work without introducing a rerender loop."
			previous={{ path: '/learn/tasks', label: 'Tasks & cleanup' }}
			next={{ path: '/learn/server-execution', label: 'Server execution' }}
		>
			<section>
				<h2>Await a task result into state</h2>
				<p>
					An eXact component remains a synchronous, durable instance at runtime. The compiler can
					still accept an <code>async</code> component when its awaited work has explicit task
					ownership and its result is assigned to one state location.
				</p>
				<CodeBlock source={awaitedTaskSource} language="tsx" title="ShippingOptions.tsx" />
				<p>
					The compiler turns this into a repeatable blocking task generation. It infers
					<code>destination</code>, wires cancellation into recognized APIs, checks the generation
					after the await, and stages the assignment. A successful readiness commit publishes the
					state change; a stale, failed, or aborted generation discards it.
				</p>
				<p>
					The source therefore reads like value flow, while the emitted client and server code
					behaves like coordinated state machines. A server task sends only its compiler-approved
					dependencies and receives only validated state and public-context writes.
				</p>
			</section>
			<section>
				<h2>The explicit form is still available</h2>
				<p>
					Awaited task syntax is convenience, not a separate runtime feature. The equivalent
					explicit form is useful when you want to name a dependency or receive the signal yourself.
				</p>
				<CodeBlock source={explicitTaskSource} language="tsx" title="Explicit readiness task" />
				<Callout title="Why some awaited forms are compiler errors">
					<p>
						A task result must be assigned directly to one writable <code>this.state</code>{' '}
						location. Arbitrary awaits, derived assignment targets, multiple sequential awaited
						tasks, and additional continuation statements are rejected until the compiler can
						preserve their restart and ordering semantics. Put additional asynchronous effects
						inside the task callback, or derive later values reactively from the assigned state.
					</p>
				</Callout>
			</section>
			<section>
				<h2>Suspense coordinates readiness</h2>
				<CodeBlock source={suspenseSource} language="tsx" title="Checkout.tsx" />
				<p>
					On first mount, the fallback is shown until blocking descendants settle. During a later
					native eXact update, already committed content remains visible while the next generation
					prepares. State and DOM publish together, so a partially completed generation cannot leak
					into the visible interface.
				</p>
				<p>
					Nested boundaries coordinate independently. Async SSR waits for settled content, while
					progressive streams can replace an individual Suspense marker range without replacing
					stable siblings. Hydration reads explicit content or fallback markers instead of guessing
					which branch the server emitted.
				</p>
			</section>
			<section>
				<h2>Activity retains inactive work</h2>
				<CodeBlock source={activitySource} language="tsx" title="Workspace.tsx" />
				<p>
					<code>active</code> content is connected normally. <code>parked</code> content is moved
					into a detached DOM fragment: component state, node identity, form values, refs, and event
					handlers remain owned, while reactive work waits. <code>background</code> is also detached
					but allows preparation at deferred priority.
				</p>
				<p>
					Parking is not unmounting. Use <code>this.onDeactivate()</code> and{' '}
					<code>this.onActivate()</code> for reconnect behavior; final ownership cleanup remains in{' '}
					<code>this.onUnmount()</code>. Nested Activity boundaries retain their own authored mode,
					and portal output parks with its logical owner.
				</p>
			</section>
			<section>
				<h2>Scheduling is a task policy</h2>
				<CodeBlock source={schedulingSource} language="tsx" title="Task policies" />
				<p>
					DOM events run at interactive priority, ordinary reactive work runs normally, and deferred
					work yields to both. Deferral changes when a task runs; blocking changes whether readiness
					waits for it; client and server facets constrain placement. These choices are independent
					and composable.
				</p>
			</section>
		</Article>
	);
}
