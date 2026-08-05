import {
	Activity,
	Fragment,
	Suspense,
	activateTaskForHost,
	createComponentInstance,
	createEnhancementMarker,
	createVNode,
	defineTask,
	markExactComponent,
	renderInstance,
	stageTaskMutation,
	type ActivityMode,
	type Child,
	type Component
} from '@exactjs/core';
import { adoptStatic, render, unmount, type RenderOptions } from '@exactjs/dom';
import { computed, flushSync, reactive } from '@exactjs/reactive';

const enhancementIdentity = '@exactjs/performance#routing';
const defaultListSize = 1_000;
const defaultTreeSize = 500;

/** Stable client scenario identifiers emitted into baseline reports and release diagnostics. */
export const clientScenarioNames = [
	'client.static-mount',
	'client.dynamic-mount',
	'client.hydration',
	'client.first-interaction',
	'client.scalar-update',
	'client.branch-update',
	'client.keyed-list-update',
	'client.enhancement-reroute',
	'client.activity-cycle',
	'client.suspense-cycle',
	'client.mixed-tree-lifecycle',
	'component.population',
	'component.api-state',
	'component.mount-unmount-heap'
] as const;

/** One supported compiler-produced client performance workload. */
export type ClientScenarioName = (typeof clientScenarioNames)[number];

/** Portable measurements and their explicit units for one client workload sample. */
export type ClientScenarioResult = Readonly<{
	metrics: Readonly<Record<string, number>>;
	units: Readonly<Record<string, 'bytes' | 'count' | 'ms'>>;
}>;

type Item = Readonly<{ id: string; label: string }>;

let scalarInstance: Component<{ count: number }> | undefined;
let branchInstance: Component<{ visible: boolean }> | undefined;
let listInstance: Component<{ items: Item[] }> | undefined;
let activityInstance: Component<{ mode: ActivityMode }> | undefined;
let suspenseInstance: Component<{ ready: boolean }> | undefined;
let settleSuspense: (() => void) | undefined;

/** Runs one browser or DOM-emulated framework scenario against compiler-produced components. */
export async function runClientScenario(
	name: ClientScenarioName,
	options: Readonly<{ iterations?: number }> = {}
): Promise<ClientScenarioResult> {
	switch (name) {
		case 'client.static-mount':
			return staticMount(options.iterations ?? defaultTreeSize);
		case 'client.dynamic-mount':
			return dynamicMount(options.iterations ?? defaultTreeSize);
		case 'client.hydration':
			return hydration();
		case 'client.first-interaction':
			return firstInteraction();
		case 'client.scalar-update':
			return scalarUpdate();
		case 'client.branch-update':
			return branchUpdate();
		case 'client.keyed-list-update':
			return keyedListUpdate(options.iterations ?? defaultListSize);
		case 'client.enhancement-reroute':
			return enhancementReroute();
		case 'client.activity-cycle':
			return activityCycle();
		case 'client.suspense-cycle':
			return suspenseCycle();
		case 'client.mixed-tree-lifecycle':
			return mixedTreeLifecycle(options.iterations ?? 100);
		case 'component.population':
			return componentPopulation(options.iterations ?? 2_000);
		case 'component.api-state':
			return componentApiState(options.iterations ?? 10_000);
		case 'component.mount-unmount-heap':
			return componentMountUnmountHeap(options.iterations ?? 200);
	}
}

function StaticTree(_props: { count: number }) {
	return () => (
		<ul>
			{Array.from({ length: _props.count }, (_, index) => (
				<li data-index={index}>Row {index}</li>
			))}
		</ul>
	);
}

function DynamicTree(this: Component<{ value: number }>, props: { count: number }) {
	this.state.value = 1;
	return () => (
		<section>
			{Array.from({ length: props.count }, (_, index) => (
				<span>{this.state.value + index}</span>
			))}
		</section>
	);
}

function hydrationTree() {
	return createVNode(
		Fragment,
		null,
		createVNode('i', null, 'first'),
		createVNode('b', null, 'second')
	);
}

function InteractiveCounter(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}

function ScalarCounter(this: Component<{ count: number }>) {
	scalarInstance = this;
	this.state.count = 0;
	return () => <output>{this.state.count}</output>;
}

function Branch(this: Component<{ visible: boolean }>) {
	branchInstance = this;
	this.state.visible = false;
	return () => <section>{this.state.visible ? <p>visible</p> : <span>hidden</span>}</section>;
}

function KeyedList(this: Component<{ items: Item[] }>, props: { items: Item[] }) {
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

const RoutingEnhancement = markExactComponent(function RoutingEnhancement(_props: {
	children?: Child;
}) {
	return () => _props.children;
}, '@exactjs/performance:RoutingEnhancement');

function ActivityBoundary(this: Component<{ mode: ActivityMode }>) {
	activityInstance = this;
	this.state.mode = 'active';
	const mode = computed(() => this.state.mode);
	return () => createVNode(Activity, { mode }, <button>retained</button>);
}

function SuspendedPanel(this: Component<{ ready: boolean }>) {
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

function SuspenseBoundary() {
	return () => createVNode(Suspense, { fallback: <span>loading</span> }, <SuspendedPanel />);
}

function MixedLeaf(this: Component<{ count: number }>, props: { index: number }) {
	this.state.count = props.index;
	return () => <button>{this.state.count}</button>;
}

function MixedTree(props: { count: number }) {
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

function PopulationComponent(this: Component<{ value: number }>, props: { value: number }) {
	this.state.value = props.value;
	return () => <span>{this.state.value}</span>;
}

function staticMount(count: number): ClientScenarioResult {
	const container = createContainer();
	const started = performance.now();
	render(<StaticTree count={count} />, container);
	const elapsed = performance.now() - started;
	assert(
		container.querySelectorAll('li').length === count,
		'static mount did not publish every row'
	);
	unmount(container);
	return elapsedResult('mountMs', elapsed, count);
}

function dynamicMount(count: number): ClientScenarioResult {
	const container = createContainer();
	const started = performance.now();
	render(<DynamicTree count={count} />, container);
	const elapsed = performance.now() - started;
	assert(container.querySelectorAll('span').length === count, 'dynamic mount lost expressions');
	unmount(container);
	return elapsedResult('mountMs', elapsed, count);
}

function hydration(): ClientScenarioResult {
	const container = createContainer();
	container.innerHTML = '<!--exact:root--><i>first</i><b>second</b><!--/exact:root-->';
	const retained = container.firstElementChild;
	const started = performance.now();
	const adopted = adoptStatic(hydrationTree(), container);
	const elapsed = performance.now() - started;
	assert(adopted, 'compiled hydration fixture did not adopt matching DOM');
	assert(container.firstElementChild === retained, 'hydration replaced matching DOM');
	unmount(container);
	return elapsedResult('hydrationMs', elapsed, 2);
}

function firstInteraction(): ClientScenarioResult {
	const container = createContainer();
	render(<InteractiveCounter />, container);
	const button = container.querySelector('button');
	assert(button, 'interaction fixture did not mount its button');
	const started = performance.now();
	button.click();
	flushSync();
	const elapsed = performance.now() - started;
	assert(button.textContent === '1', 'first interaction did not publish state');
	unmount(container);
	return elapsedResult('interactionMs', elapsed, 1);
}

function scalarUpdate(): ClientScenarioResult {
	const container = createContainer();
	scalarInstance = undefined;
	render(<ScalarCounter />, container);
	assert(scalarInstance, 'compiled scalar component did not expose its instance');
	const started = performance.now();
	scalarInstance.state.count = 1;
	flushSync();
	const elapsed = performance.now() - started;
	assert(container.textContent === '1', 'scalar update did not reach DOM');
	unmount(container);
	return elapsedResult('updateMs', elapsed, 1);
}

function branchUpdate(): ClientScenarioResult {
	const container = createContainer();
	branchInstance = undefined;
	render(<Branch />, container);
	assert(branchInstance, 'compiled branch component did not expose its instance');
	const started = performance.now();
	branchInstance.state.visible = true;
	flushSync();
	const elapsed = performance.now() - started;
	assert(
		container.querySelector('p')?.textContent === 'visible',
		'branch update selected wrong DOM'
	);
	unmount(container);
	return elapsedResult('updateMs', elapsed, 1);
}

function keyedListUpdate(count: number): ClientScenarioResult {
	const items = Array.from({ length: count }, (_, index) => ({
		id: String(index),
		label: `Row ${index}`
	}));
	const container = createContainer();
	listInstance = undefined;
	render(<KeyedList items={items} />, container);
	assert(listInstance, 'compiled keyed-list component did not expose its instance');
	const last = items.at(-1);
	assert(last, 'keyed-list fixture requires at least one item');
	const started = performance.now();
	listInstance.state.items.splice(0, items.length, last, ...items.slice(0, -1));
	flushSync();
	const elapsed = performance.now() - started;
	assert(container.querySelectorAll('li').length === count, 'keyed update lost rows');
	assert(
		container.querySelector('li')?.textContent === last.label,
		'keyed update published wrong order'
	);
	unmount(container);
	return elapsedResult('updateMs', elapsed, count);
}

function enhancementReroute(): ClientScenarioResult {
	const rootState = reactive({ left: true });
	const left = computed(() => rootState.left);
	const right = computed(() => !rootState.left);
	const marker = (root: ReturnType<typeof computed<boolean>>) =>
		createEnhancementMarker([{ identity: enhancementIdentity, props: {}, root }]);
	const tree = createVNode(
		'section',
		{
			__exactEnhancements: createEnhancementMarker([
				{ identity: enhancementIdentity, props: { preset: 'fade' } }
			])
		},
		createVNode('button', { id: 'left', __exactEnhancements: marker(left) }, 'Left'),
		createVNode('button', { id: 'right', __exactEnhancements: marker(right) }, 'Right')
	);
	const container = createContainer();
	let renderFailure: unknown;
	const renderOptions: RenderOptions = {
		enhancementCatalog: new Map([[enhancementIdentity, RoutingEnhancement]]),
		onErrorReport: (report) => {
			renderFailure = report.error;
		}
	};
	render(tree, container, renderOptions);
	if (renderFailure) throw renderFailure;
	const started = performance.now();
	rootState.left = false;
	flushSync();
	const elapsed = performance.now() - started;
	assert(
		container.querySelectorAll('button').length === 2,
		'enhancement reroute changed target DOM'
	);
	unmount(container);
	return elapsedResult('updateMs', elapsed, 1);
}

function activityCycle(): ClientScenarioResult {
	const container = createContainer();
	activityInstance = undefined;
	render(<ActivityBoundary />, container);
	assert(activityInstance, 'compiled Activity boundary did not expose its instance');
	const button = container.querySelector('button');
	assert(button, 'Activity fixture did not mount retained DOM');
	const started = performance.now();
	activityInstance.state.mode = 'parked';
	flushSync();
	activityInstance.state.mode = 'active';
	flushSync();
	const elapsed = performance.now() - started;
	assert(container.querySelector('button') === button, 'Activity cycle lost retained DOM identity');
	unmount(container);
	return elapsedResult('cycleMs', elapsed, 1);
}

async function suspenseCycle(): Promise<ClientScenarioResult> {
	const container = createContainer();
	suspenseInstance = undefined;
	settleSuspense = undefined;
	render(<SuspenseBoundary />, container);
	assert(container.textContent === 'loading', 'Suspense fixture did not publish fallback');
	assert(settleSuspense, 'Suspense fixture did not activate blocking work');
	const started = performance.now();
	settleSuspense();
	await settleFrameworkWork(() => container.textContent === 'ready');
	const elapsed = performance.now() - started;
	assert(suspenseInstance?.state.ready === true, 'Suspense work did not commit component state');
	unmount(container);
	return elapsedResult('settleMs', elapsed, 1);
}

function mixedTreeLifecycle(count: number): ClientScenarioResult {
	const container = createContainer();
	const mountStarted = performance.now();
	render(<MixedTree count={count} />, container);
	const mountMs = performance.now() - mountStarted;
	assert(container.querySelectorAll('button').length === count, 'mixed tree lost component leaves');
	const teardownStarted = performance.now();
	unmount(container);
	const teardownMs = performance.now() - teardownStarted;
	assert(container.childNodes.length === 0, 'mixed tree teardown retained DOM');
	return {
		metrics: { mountMs, teardownMs, nodes: count },
		units: { mountMs: 'ms', teardownMs: 'ms', nodes: 'count' }
	};
}

function componentPopulation(count: number): ClientScenarioResult {
	const started = performance.now();
	const instances = Array.from({ length: count }, (_, value) =>
		createComponentInstance(PopulationComponent, { value })
	);
	flushSync();
	const createMs = performance.now() - started;
	assert(
		instances.at(-1)?.state.value === count - 1,
		'component population lost inspectable state'
	);
	const disposeStarted = performance.now();
	for (const instance of instances) instance.unmount('performance-dispose');
	const disposeMs = performance.now() - disposeStarted;
	return {
		metrics: { createMs, disposeMs, components: count },
		units: { createMs: 'ms', disposeMs: 'ms', components: 'count' }
	};
}

function componentApiState(iterations: number): ClientScenarioResult {
	const instance = createComponentInstance(PopulationComponent, { value: 1 });
	flushSync();
	const rendered = renderInstance(instance, () => undefined);
	assert(rendered.length > 0, 'compiled component API fixture did not produce output');
	let checksum = 0;
	const started = performance.now();
	for (let index = 0; index < iterations; index++) {
		instance.state.value = index;
		checksum += instance.state.value;
	}
	const elapsed = performance.now() - started;
	assert(checksum > 0, 'component API state benchmark was optimized away');
	instance.unmount('performance-api-state');
	return elapsedResult('accessMs', elapsed, iterations);
}

async function componentMountUnmountHeap(count: number): Promise<ClientScenarioResult> {
	const collect = (globalThis as typeof globalThis & { gc?: () => void }).gc;
	assert(collect, 'heap scenario requires Node or Chromium with exposed garbage collection');
	collect();
	const before = currentHeap();
	let peak = before;
	for (let cycle = 0; cycle < 5; cycle++) {
		const container = createContainer();
		render(<MixedTree count={count} />, container);
		peak = Math.max(peak, currentHeap());
		assert(
			container.querySelectorAll('button').length === count,
			'heap cycle lost mounted components'
		);
		unmount(container);
		await settleDisposal();
	}
	await settleDisposal();
	collect();
	const retained = currentHeap();
	return {
		metrics: {
			baselineBytes: before,
			peakBytes: peak,
			retainedBytes: retained,
			retainedDeltaBytes: retained - before,
			mountedComponentsPerCycle: count
		},
		units: {
			baselineBytes: 'bytes',
			peakBytes: 'bytes',
			retainedBytes: 'bytes',
			retainedDeltaBytes: 'bytes',
			mountedComponentsPerCycle: 'count'
		}
	};
}

async function settleDisposal(): Promise<void> {
	for (let index = 0; index < 4; index++) await Promise.resolve();
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function elapsedResult(metric: string, elapsed: number, operations: number): ClientScenarioResult {
	return {
		metrics: { [metric]: elapsed, operations },
		units: { [metric]: 'ms', operations: 'count' }
	};
}

function createContainer(): HTMLElement {
	return document.createElement('div');
}

async function settleFrameworkWork(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		await Promise.resolve();
		flushSync();
		if (condition()) return;
	}
	throw new Error('framework work did not settle within 100 microtask turns');
}

function currentHeap(): number {
	const chromiumMemory = (performance as Performance & { memory?: { usedJSHeapSize?: number } })
		.memory?.usedJSHeapSize;
	if (typeof chromiumMemory === 'number') return chromiumMemory;
	const nodeProcess = globalThis.process as
		| { memoryUsage?: () => { heapUsed: number } }
		| undefined;
	return nodeProcess?.memoryUsage?.().heapUsed ?? 0;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
