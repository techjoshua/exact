import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const awaitedTaskSource = `async function ShippingOptions(
  this: Component<ShippingState>
) {
  // destination is inferred as the rerun dependency. getOptions receives
  // the generation's AbortSignal when its signature accepts one.
  this.state.options = await getOptions(this.state.destination);

  return () => <Options options={this.state.options} />;
}`;

const sequentialSource = `async function CustomerOrders(
  this: Component<CustomerState>
) {
  try {
    const customer = await loadCustomer(this.state.customerId);
    const orders = await loadOrders(customer.id);

    // Both results publish together after the complete generation settles.
    [this.state.customer, this.state.orders] = [customer, orders];
  } catch (error) {
    // Application failures can recover normally.
    this.state.error = describeError(error);
  } finally {
    // Awaited cleanup remains part of this initializer generation.
    await recordInitializationAttempt();
    // State from a cancelled generation is discarded rather than published.
    this.state.loading = false;
  }

  return () => <Orders state={this.state} />;
}`;

const policyTaskSource = `function ShippingOptions(
  this: Component<ShippingState>
) {
  async function loadOptions(
    destination: string,
    task: TaskContext = TaskContext.client().latest().blocking()
  ) {
      const options = await getOptions(destination, { signal: task.signal });

      // Conceptually staged until this blocking generation commits.
      this.state.options = options;
  }
  loadOptions(this.state.destination);

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
function refresh(task: TaskContext = TaskContext.client()) {
  return refreshStatus(task.signal);
}
refresh();

// Lower-priority preparation. Placement remains compiler-inferred.
function prepare(document: Document, task: TaskContext = TaskContext.deferred()) {
  return precomputePreview(document);
}
prepare(this.state.document);

// Unawaited work that deliberately blocks the nearest Suspense boundary.
async function loadCatalogTask(task: TaskContext = TaskContext.blocking()) {
  this.state.catalog = await loadCatalog();
}
loadCatalogTask();

// Placement, priority, and readiness facets compose.
function warm(task: TaskContext = TaskContext.server().deferred().blocking()) {
  return warmRecommendations();
}
warm();`;

/** Documents async component continuations, readiness, retention, and scheduling. */
export function AsyncInterfacesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Async values, ordinary flow"
			description="Await ordinary operations into state, coordinate readiness with Suspense, retain inactive mounted trees with Activity, and choose lower-priority work without introducing a rerender loop."
			previous={{ path: '/learn/component-registries', label: 'Dynamic components' }}
			next={{ path: '/learn/server-execution', label: 'Server execution' }}
		>
			<section>
				<h2>Async syntax is shorthand for owned task work</h2>
				<p>
					An eXact component does not become a promise-returning rerender function. It remains a
					durable instance with synchronous setup and a returned render function. When setup awaits
					a value that flows into <code>this.state</code>, the compiler moves that continuation into
					an owned task generation and reconnects its successful state publication to the instance.
				</p>
				<p>Keep three independent decisions separate:</p>
				<ul>
					<li>
						<strong>Suspension:</strong> <code>await</code> pauses this generation until a result is
						available while retaining cancellation and stale-work fencing.
					</li>
					<li>
						<strong>Priority:</strong> immediate, normal, or deferred policy determines when
						eligible work runs.
					</li>
					<li>
						<strong>Readiness:</strong> blocking or nonblocking policy determines whether the
						nearest Suspense boundary waits.
					</li>
				</ul>
				<p>
					These often appear together, but none implies the others. An awaited task can be
					nonblocking; unawaited work can deliberately block readiness; and deferred work can still
					be blocking.
				</p>
			</section>
			<section>
				<h2>Await a result into state</h2>
				<p>
					The concise form lets the authored component read as ordinary value flow. The assignment
					names the durable state destination, while the awaited expression supplies the value for
					the current generation.
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
				<h2>Sequential control flow stays TypeScript</h2>
				<p>
					Awaited operations run in source order, but their state writes remain private to the
					current generation. eXact publishes them together only after every operation—including
					awaited work in the enclosing <code>finally</code> block—completes successfully.
				</p>
				<CodeBlock source={sequentialSource} language="tsx" title="CustomerOrders.tsx" />
				<p>
					An authored <code>catch</code> handles application failures. Framework cancellation and
					supersession bypass it so an obsolete request cannot turn into a committed fallback, while
					<code>finally</code> still runs for ordinary cleanup. Server-local exceptions stay on the
					server; expected failures that must cross runtimes should use shared, serializable result
					values.
				</p>
			</section>
			<section>
				<h2>Name the task when you need authored policy</h2>
				<p>
					The compiler lowers ordinary awaited assignments through the same task machinery. Use the
					named function form with a final <code>TaskContext</code> parameter when you want to make
					activation inputs visible, receive the generation signal yourself, constrain placement, or
					select scheduling policy.
				</p>
				<CodeBlock source={policyTaskSource} language="tsx" title="Task with authored readiness" />
				<Callout title="Why some awaited forms are compiler errors">
					<p>
						Values needed by the returned render function must be assigned to
						<code>this.state</code>; a local created inside the asynchronous continuation is not
						published state. Native array and object destructuring—including defaults, rest targets,
						and computed property keys—may publish several writable state locations atomically. A
						non-state target, reactive self-dependency, or value that violates server/client
						serialization or secret policy remains a compiler error.
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
					Parking is not unmounting. Use <code>this.onDeactivate()</code> and
					<code>this.onActivate()</code> for reconnect behavior; final ownership cleanup remains in
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
