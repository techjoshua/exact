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
import {
	ActivityBoundary,
	Branch,
	DynamicTree,
	InteractiveCounter,
	KeyedList,
	MixedTree,
	PopulationComponent,
	RoutingEnhancement,
	ScalarCounter,
	StaticTree,
	SuspenseBoundary,
	activityInstance,
	branchInstance,
	enhancementIdentity,
	hydrationTree,
	listInstance,
	releaseActivityInstance,
	releaseBranchInstance,
	releaseListInstance,
	releaseScalarInstance,
	releaseSuspenseInstance,
	scalarInstance,
	settleSuspense,
	suspenseInstance,
	type Item
} from './client-scenario-components.js';

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
	releaseScalarInstance();
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
	releaseBranchInstance();
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
	releaseListInstance();
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
	releaseActivityInstance();
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
	releaseSuspenseInstance();
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
