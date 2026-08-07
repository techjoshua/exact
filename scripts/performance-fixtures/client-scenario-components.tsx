import {
	Activity,
	Fragment,
	Suspense,
	activateTaskForHost,
	createVNode,
	defineTask,
	markExactComponent,
	stageTaskMutation,
	type ActivityMode,
	type Child,
	type Component
} from '@exactjs/core';
import { computed } from '@exactjs/reactive';

/** Stable enhancement identity used by the client routing workload. */
export const enhancementIdentity = '@exactjs/performance#routing';

/** Stable keyed-list record used by list reconciliation workloads. */
export type Item = Readonly<{ id: string; label: string }>;

export let scalarInstance: Component<{ count: number }> | undefined;
export let branchInstance: Component<{ visible: boolean }> | undefined;
export let listInstance: Component<{ items: Item[] }> | undefined;
export let activityInstance: Component<{ mode: ActivityMode }> | undefined;
export let suspenseInstance: Component<{ ready: boolean }> | undefined;
export let commitInstance:
	| Component<{ value: string; title: string; selected: boolean }>
	| undefined;
export let settleSuspense: (() => void) | undefined;

/** Releases the retained scalar component so heap measurements do not retain prior workloads. */
export function releaseScalarInstance(): void {
	scalarInstance = undefined;
}

/** Releases the retained branch component after its update workload. */
export function releaseBranchInstance(): void {
	branchInstance = undefined;
}

/** Releases the retained list component after its reconciliation workload. */
export function releaseListInstance(): void {
	listInstance = undefined;
}

/** Releases the retained Activity owner after its park-and-restore workload. */
export function releaseActivityInstance(): void {
	activityInstance = undefined;
}

/** Releases the retained Suspense owner and pending settlement callback. */
export function releaseSuspenseInstance(): void {
	suspenseInstance = undefined;
	settleSuspense = undefined;
}

/** Releases the retained DOM-commit component after its burst workload. */
export function releaseCommitInstance(): void {
	commitInstance = undefined;
}

/** Produces the fixed host tree used to measure initial mount throughput. */
export function StaticTree(_props: { count: number }) {
	return () => (
		<ul>
			{Array.from({ length: _props.count }, (_, index) => (
				<li data-index={index}>Row {index}</li>
			))}
		</ul>
	);
}

/** Produces a state-dependent host tree used to measure dynamic mount cost. */
export function DynamicTree(this: Component<{ value: number }>, props: { count: number }) {
	this.state.value = 1;
	return () => (
		<section>
			{Array.from({ length: props.count }, (_, index) => (
				<span>{this.state.value + index}</span>
			))}
		</section>
	);
}

/** Produces deterministic sibling markup shared by server adoption and client hydration. */
export function hydrationTree() {
	return createVNode(
		Fragment,
		null,
		createVNode('i', null, 'first'),
		createVNode('b', null, 'second')
	);
}

/** Captures the first native event-to-state update workload. */
export function InteractiveCounter(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}

/** Exposes one retained scalar dependency for precise update timing. */
export function ScalarCounter(this: Component<{ count: number }>) {
	scalarInstance = this;
	this.state.count = 0;
	return () => <output>{this.state.count}</output>;
}

/** Exposes one retained conditional branch for replacement timing. */
export function Branch(this: Component<{ visible: boolean }>) {
	branchInstance = this;
	this.state.visible = false;
	return () => <section>{this.state.visible ? <p>visible</p> : <span>hidden</span>}</section>;
}

/** Exposes a retained keyed list for reorder and insertion timing. */
export function KeyedList(this: Component<{ items: Item[] }>, props: { items: Item[] }) {
	listInstance = this;
	this.state.items = props.items;
	return () => (
		<ul>
			{this.map(
				this.state.items,
				(item) => item.id,
				(item) => (
					<li>{item.label}</li>
				)
			)}
		</ul>
	);
}

/** Transparent enhancement used to measure explicit-target rerouting. */
export const RoutingEnhancement = markExactComponent(function RoutingEnhancement(_props: {
	children?: Child;
}) {
	return () => _props.children;
}, '@exactjs/performance:RoutingEnhancement');

/** Exposes an Activity boundary whose retained mode can be cycled by the workload. */
export function ActivityBoundary(this: Component<{ mode: ActivityMode }>) {
	activityInstance = this;
	this.state.mode = 'active';
	const mode = computed(() => this.state.mode);
	return () => createVNode(Activity, { mode }, <button>retained</button>);
}

/** Owns the blocking task used to measure Suspense settlement. */
export function SuspendedPanel(this: Component<{ ready: boolean }>) {
	suspenseInstance = this;
	this.state.ready = false;
	const pending = new Promise<void>((resolve) => {
		settleSuspense = resolve;
	});
	activateTaskForHost(
		this,
		defineTask({ readiness: 'blocking' }, async ({ signal }) => {
			await pending;
			stageTaskMutation(signal, () => {
				this.state.ready = true;
			});
		})
	);
	return () => <p>{this.state.ready ? 'ready' : 'waiting'}</p>;
}

/** Wraps the benchmark panel in a native fallback boundary. */
export function SuspenseBoundary() {
	return () => createVNode(Suspense, { fallback: <span>loading</span> }, <SuspendedPanel />);
}

/** Provides one stateful leaf in the mixed lifecycle workload. */
export function MixedLeaf(this: Component<{ count: number }>, props: { index: number }) {
	this.state.count = props.index;
	return () => <button>{this.state.count}</button>;
}

/** Produces the mixed static, retained, and stateful component workload. */
export function MixedTree(props: { count: number }) {
	return () => (
		<main>
			<header>mixed</header>
			{createVNode(
				Activity,
				{ mode: 'active' },
				<section>
					{Array.from({ length: props.count }, (_, index) => (
						<MixedLeaf key={String(index)} index={index} />
					))}
				</section>
			)}
			<footer>done</footer>
		</main>
	);
}

/** Provides one minimal durable instance for component population measurements. */
export function PopulationComponent(this: Component<{ value: number }>, props: { value: number }) {
	this.state.value = props.value;
	return () => <span>{this.state.value}</span>;
}

/** Exposes several bindings on one focused control for root-commit workloads. */
export function CommitBurst(this: Component<{ value: string; title: string; selected: boolean }>) {
	commitInstance = this;
	this.state.value = 'initial';
	this.state.title = 'initial';
	this.state.selected = false;
	return () => (
		<input value={this.state.value} title={this.state.title} aria-selected={this.state.selected} />
	);
}
