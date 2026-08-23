import { TaskContext, taskTimeout, type Component } from '@exactjs/core';
import { renderToStringAsync } from '@exactjs/ssr';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { ServerScenarioResult } from './server-scenarios.js';

type TaskReadinessState = { value: number };

const counters = {
	active: 0,
	completed: 0,
	peak: 0,
	started: 0,
	startedAtFirstSettlement: 0
};

function TaskReadinessLeaf(
	this: Component<TaskReadinessState>,
	props: { request: number; value: number }
) {
	this.state.value = 0;
	const prepare = async (
		request: number,
		value: number,
		task: TaskContext = TaskContext.server().blocking()
	) => {
		counters.started++;
		counters.active++;
		counters.peak = Math.max(counters.peak, counters.active);
		await new Promise<void>((resolve) => taskTimeout(task.signal, resolve, 1));
		if (counters.completed++ === 0) counters.startedAtFirstSettlement = counters.started;
		this.state.value = request * 10_000 + value;
		counters.active--;
	};
	void prepare(props.request, props.value);
	return () => <li>{this.state.value}</li>;
}

function TaskReadinessTree(props: { request: number }) {
	return () => (
		<ul>
			<TaskReadinessLeaf key={`${props.request}:0`} request={props.request} value={0} />
			<TaskReadinessLeaf key={`${props.request}:1`} request={props.request} value={1} />
			<TaskReadinessLeaf key={`${props.request}:2`} request={props.request} value={2} />
			<TaskReadinessLeaf key={`${props.request}:3`} request={props.request} value={3} />
			<TaskReadinessLeaf key={`${props.request}:4`} request={props.request} value={4} />
			<TaskReadinessLeaf key={`${props.request}:5`} request={props.request} value={5} />
			<TaskReadinessLeaf key={`${props.request}:6`} request={props.request} value={6} />
			<TaskReadinessLeaf key={`${props.request}:7`} request={props.request} value={7} />
		</ul>
	);
}

/** Measures compiler-issued request-local task slices and their readiness behavior. */
export async function taskReadinessSsr(count: number): Promise<ServerScenarioResult> {
	const componentsPerRequest = Math.min(count, 8);
	assert(componentsPerRequest === 8, 'task readiness fixture requires at least eight components');
	let probeGenericInstances = 0;
	let probeDirectComponents = 0;
	await renderToStringAsync(<TaskReadinessTree request={0} />, {
		markers: false,
		onComponentCreated: () => probeGenericInstances++,
		onDirectComponentCreated: () => probeDirectComponents++
	});
	assert(probeGenericInstances === 0, 'compiler-closed scheduled SSR used generic instances');
	assert(probeDirectComponents === 9, 'task readiness fixture did not use direct frames');

	const requestCount = 8;
	resetCounters();
	const serialStarted = performance.now();
	await renderRequests(requestCount, 1);
	const serialRenderMs = performance.now() - serialStarted;
	const serialTaskStartsAtFirstSettlement = counters.startedAtFirstSettlement;
	const serialPeakConcurrentTasks = counters.peak;

	resetCounters();
	const markerStarted = performance.now();
	await renderRequests(requestCount, 4, true);
	const markerRenderMs = performance.now() - markerStarted;
	const markerTaskStartsAtFirstSettlement = counters.startedAtFirstSettlement;
	const markerPeakConcurrentTasks = counters.peak;

	resetCounters();
	globalThis.gc?.();
	const startingHeap = process.memoryUsage().heapUsed;
	const started = performance.now();
	const results = await renderRequests(requestCount, 4);
	const renderMs = performance.now() - started;
	const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - startingHeap);
	globalThis.gc?.();
	const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - startingHeap);

	for (let request = 0; request < requestCount; request++) {
		const expected = (request + 1) * 10_000 + componentsPerRequest - 1;
		assert(
			results[request]!.html.includes(`<li>${expected}</li>`),
			`concurrent scheduled SSR request ${request + 1} published another request's state`
		);
	}
	const expectedTasks = componentsPerRequest * requestCount;
	assert(counters.started === expectedTasks, 'scheduled SSR lost task activations');
	assert(counters.active === 0, 'scheduled SSR retained active task work');
	const payload = Buffer.from(results.map((result) => result.html).join('\n'));
	return {
		metrics: {
			renderMs,
			serialRenderMs,
			markerRenderMs,
			heapGrowthBytes,
			retainedHeapBytes,
			requests: requestCount,
			components: expectedTasks,
			taskStarts: counters.started,
			taskStartsAtFirstSettlement: counters.startedAtFirstSettlement,
			peakConcurrentTasks: counters.peak,
			serialTaskStartsAtFirstSettlement,
			serialPeakConcurrentTasks,
			markerTaskStartsAtFirstSettlement,
			markerPeakConcurrentTasks,
			genericInstances: probeGenericInstances,
			htmlBytes: payload.byteLength,
			htmlGzipBytes: gzipSync(payload).byteLength,
			htmlBrotliBytes: brotliCompressSync(payload).byteLength
		},
		units: {
			renderMs: 'ms',
			serialRenderMs: 'ms',
			markerRenderMs: 'ms',
			heapGrowthBytes: 'bytes',
			retainedHeapBytes: 'bytes',
			requests: 'count',
			components: 'count',
			taskStarts: 'count',
			taskStartsAtFirstSettlement: 'count',
			peakConcurrentTasks: 'count',
			serialTaskStartsAtFirstSettlement: 'count',
			serialPeakConcurrentTasks: 'count',
			markerTaskStartsAtFirstSettlement: 'count',
			markerPeakConcurrentTasks: 'count',
			genericInstances: 'count',
			htmlBytes: 'bytes',
			htmlGzipBytes: 'bytes',
			htmlBrotliBytes: 'bytes'
		}
	};
}

async function renderRequests(requests: number, concurrency: number, markers = false) {
	return Promise.all(
		Array.from({ length: requests }, (_, request) =>
			renderToStringAsync(<TaskReadinessTree request={request + 1} />, {
				markers,
				maxAsyncSsrConcurrency: concurrency
			})
		)
	);
}

function resetCounters(): void {
	counters.active = 0;
	counters.completed = 0;
	counters.peak = 0;
	counters.started = 0;
	counters.startedAtFirstSettlement = 0;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
