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
			description="Show loading content while work is pending, and keep a hidden view ready to use again."
			previous={{ path: '/learn/tasks', label: 'Tasks, dependencies & scheduling' }}
			next={{ path: '/learn/component-registries', label: 'Dynamic components' }}
		>
			<section>
				<h2>Load data for a component</h2>
				<p>
					A checkout cannot show shipping options before it knows which carriers serve the address.
					On first load, it needs a loading view. When the address changes later, replacing the
					whole section with a spinner can make the page flicker and interrupt the user.
				</p>
				<p>
					In eXact, assign the awaited result to state and wrap the content in
					<strong>Suspense</strong>, a component that coordinates the loading view. It shows a
					fallback initially and keeps previously displayed content in place while an update
					prepares. eXact manages the request as a task, including cancellation when its inputs
					change or the component is removed.
				</p>
			</section>
			<section>
				<h2>Await a result into state</h2>
				<p>
					Assign the awaited value to the state field that the view displays. In this example,
					changing the destination starts a new request for shipping options.
				</p>
				<CodeBlock source={awaitedTaskSource} language="tsx" title="ShippingOptions.tsx" />
				<p>
					eXact waits for the operation before marking this content ready. If the destination
					changes, it cancels the old run and starts another. Only a successful current run updates
					state, so an older response cannot replace the newer destination’s options.
				</p>
				<p>
					Server tasks follow the same rule. eXact transfers the allowed inputs and validates the
					returned state changes before applying them in the browser.
				</p>
			</section>
			<section>
				<h2>Sequential control flow stays TypeScript</h2>
				<p>
					Loading a customer and then their orders takes two requests. If the selected customer
					changes between them, publishing each response immediately could display one customer’s
					name beside another’s orders. Here, both assignments belong to one run of the task. eXact
					publishes them together after the run, including awaited cleanup, succeeds.
				</p>
				<CodeBlock source={sequentialSource} language="tsx" title="CustomerOrders.tsx" />
				<p>
					An authored <code>catch</code> handles application failures. Framework cancellation and
					supersession bypass it so an obsolete request cannot turn into a committed fallback, while
					<code>finally</code> still runs for ordinary cleanup. Server-local exceptions stay on the
					server. Expected failures that must cross runtimes should use shared, serializable result
					values.
				</p>
			</section>
			<section>
				<h2>Give work a name and a policy</h2>
				<p>
					Ordinary awaited assignments already use the task machinery. A named function with a final
					<code>TaskContext</code> parameter gives you more explicit control. It can name the inputs
					that start each run, provide its cancellation signal, and specify placement or scheduling.
				</p>
				<CodeBlock source={policyTaskSource} language="tsx" title="Task with authored readiness" />
				<Callout title="Why some awaited forms are compiler errors">
					<p>
						Values needed by the returned render function must be assigned to
						<code>this.state</code>. A local created inside the asynchronous continuation is not
						published state. Native array and object destructuring, including defaults, rest
						targets, and computed property keys, may publish several writable state locations
						atomically. A non-state target, reactive self-dependency, or value that violates
						server/client serialization or secret policy remains a compiler error.
					</p>
				</Callout>
			</section>
			<section>
				<h2>Show a fallback while content loads</h2>
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
				<p>
					The compiler selects the coordinated Activity and Suspense DOM implementation only for a
					bundle that authors one of these boundaries, including lazy and microfrontend bundles.
					Runtime integrations outside compiled component source opt in through
					<code>@exactjs/dom/structural-boundaries</code>.
				</p>
			</section>
			<section>
				<h2>Hide a view while keeping its state</h2>
				<p>
					Switching away from an editor tab should not discard an unfinished draft. Keeping the
					entire editor running while it is hidden can waste work, though. <code>Activity</code>
					lets you retain the view and its state while choosing whether its reactive work pauses or
					continues in the background.
				</p>
				<CodeBlock source={activitySource} language="tsx" title="Workspace.tsx" />
				<p>
					<code>active</code> content is connected normally. <code>parked</code> content is moved
					into a detached DOM fragment: component state, node identity, form values, refs, and event
					handlers remain owned, while reactive work waits. <code>background</code> is also detached
					but allows preparation at deferred priority.
				</p>
				<p>
					Parking is not unmounting. Use <code>this.onDeactivate()</code> and
					<code>this.onActivate()</code> for reconnect behavior. Final ownership cleanup remains in
					<code>this.onUnmount()</code>. Nested Activity boundaries retain their own authored mode,
					and portal output parks with its logical owner.
				</p>
			</section>
			<section>
				<h2>Defer lower-priority work</h2>
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
					nonblocking. Unawaited work can deliberately block readiness. Deferred work can still be
					blocking.
				</p>
				<CodeBlock source={schedulingSource} language="tsx" title="Task policies" />
				<p>
					DOM events run at interactive priority, ordinary reactive work runs normally, and deferred
					work yields to both. Deferral changes when a task runs. Blocking changes whether readiness
					waits for it. Client and server facets constrain placement. These choices are independent
					and composable.
				</p>
			</section>
		</Article>
	);
}
