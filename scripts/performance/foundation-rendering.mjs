import {
	activateTaskForHost,
	createVNode,
	defineTask,
	exactComponentType
} from '../../packages/core/dist/index.js';
import { renderToString, renderToStringAsync } from '../../packages/ssr/dist/index.js';
import {
	elapsedAsync,
	elapsedAsyncWithPeakHeap,
	elapsedWithPeakHeap,
	payloadBytes
} from './foundation-measurement.mjs';

function IoPanel(props) {
	this.state.ready = false;
	activateTaskForHost(
		this,
		defineTask({ readiness: 'blocking' }, async () => {
			await new Promise((resolve) => setTimeout(resolve, props.delayMs));
			this.state.ready = true;
		})
	);
	return () => createVNode('output', null, this.state.ready ? 'ready' : 'waiting');
}
Object.defineProperty(IoPanel, exactComponentType, { value: 'performance:IoPanel' });

function CpuPanel(props) {
	this.state.value = 0;
	activateTaskForHost(
		this,
		defineTask({ readiness: 'blocking' }, async () => {
			let value = 0;
			for (let index = 0; index < props.iterations; index++) value = (value + index) % 1_000_003;
			this.state.value = value;
		})
	);
	return () => createVNode('output', null, this.state.value);
}
Object.defineProperty(CpuPanel, exactComponentType, { value: 'performance:CpuPanel' });

/** Compares generic SSR with the accepted compiler-owned render-program subset. */
export function measureRenderPlan() {
	const count = 500;
	const iterations = 20;
	const vnode = createBenchmarkTree(count);
	const expected = renderToString(vnode, { markers: false }).html;
	const generic = elapsedWithPeakHeap(() => {
		let output = '';
		for (let index = 0; index < iterations; index++)
			output = renderToString(vnode, { markers: false }).html;
		return output;
	});
	const planned = elapsedWithPeakHeap(() => {
		let output = '';
		for (let index = 0; index < iterations; index++) output = renderBenchmarkPlan(count);
		return output;
	});
	if (generic.value !== expected || planned.value !== expected)
		throw new Error('render-plan prototype changed exact SSR output');
	return {
		genericMs: generic.duration,
		plannedMs: planned.duration,
		speedup: generic.duration / planned.duration,
		genericPeakHeapBytes: generic.peakHeapBytes,
		plannedPeakHeapBytes: planned.peakHeapBytes,
		...payloadBytes('html', expected)
	};
}

function createBenchmarkTree(count) {
	return createVNode(
		'main',
		null,
		createVNode('h1', null, 'Server benchmark'),
		createVNode(
			'ul',
			null,
			...Array.from({ length: count }, (_, index) =>
				createVNode('li', { 'data-index': index }, `Row ${index}`)
			)
		)
	);
}

function renderBenchmarkPlan(count) {
	const chunks = ['<main><h1>Server benchmark</h1><ul>'];
	for (let index = 0; index < count; index++)
		chunks.push(`<li data-index="${index}">Row ${String(index)}</li>`);
	chunks.push('</ul></main>');
	return chunks.join('');
}

/** Compares serial SSR with bounded ordered rendering of independent sibling roots. */
export async function measureAsyncSsr() {
	const siblings = 8;
	const delayMs = 5;
	const serial = await measuredStage('serial async SSR', () =>
		elapsedAsyncWithPeakHeap(() => renderIoGroup(siblings, delayMs))
	);
	const measurements = {};
	for (const concurrency of [1, 2, 4, 8]) {
		const candidate = await measuredStage(`async SSR concurrency ${concurrency}`, () =>
			elapsedAsyncWithPeakHeap(() => renderIoGroupConcurrently(siblings, delayMs, concurrency))
		);
		if (candidate.value !== serial.value)
			throw new Error(`async SSR concurrency ${concurrency} changed exact output`);
		measurements[`concurrency${concurrency}Ms`] = candidate.duration;
		measurements[`concurrency${concurrency}PeakHeapBytes`] = candidate.peakHeapBytes;
	}
	const cpuSerial = await elapsedAsync(() => renderCpuGroup(siblings, 50_000));
	const cpuConcurrent = await elapsedAsync(() => renderCpuGroupConcurrently(siblings, 50_000, 4));
	if (cpuConcurrent.value !== cpuSerial.value)
		throw new Error('async SSR CPU concurrency changed exact output');
	const requestsSerial = await elapsedAsync(async () => {
		for (let index = 0; index < 4; index++) await renderIoGroup(siblings, delayMs);
	});
	const requestsConcurrent = await elapsedAsync(() =>
		Promise.all(Array.from({ length: 4 }, () => renderIoGroup(siblings, delayMs)))
	);
	return {
		serialMs: serial.duration,
		serialPeakHeapBytes: serial.peakHeapBytes,
		...measurements,
		speedupAt4: serial.duration / measurements.concurrency4Ms,
		speedupAt8: serial.duration / measurements.concurrency8Ms,
		cpuSerialMs: cpuSerial.duration,
		cpuConcurrency4Ms: cpuConcurrent.duration,
		cpuThroughputRatio: cpuSerial.duration / cpuConcurrent.duration,
		concurrentRequestsSerialMs: requestsSerial.duration,
		concurrentRequestsParallelMs: requestsConcurrent.duration,
		...payloadBytes('html', serial.value)
	};
}

async function measuredStage(name, operation) {
	try {
		return await operation();
	} catch (error) {
		throw new Error(`${name} failed`, { cause: error });
	}
}

async function renderIoGroup(siblings, delayMs) {
	return (
		await renderToStringAsync(
			createVNode(
				'section',
				null,
				...Array.from({ length: siblings }, () => createVNode(IoPanel, { delayMs }))
			),
			{ markers: false }
		)
	).html;
}

async function renderIoGroupConcurrently(siblings, delayMs, concurrency) {
	return renderIndependently(siblings, concurrency, () => createVNode(IoPanel, { delayMs }));
}

async function renderCpuGroup(siblings, iterations) {
	return (
		await renderToStringAsync(
			createVNode(
				'section',
				null,
				...Array.from({ length: siblings }, () => createVNode(CpuPanel, { iterations }))
			),
			{ markers: false }
		)
	).html;
}

async function renderCpuGroupConcurrently(siblings, iterations, concurrency) {
	return renderIndependently(siblings, concurrency, () => createVNode(CpuPanel, { iterations }));
}

async function renderIndependently(siblings, concurrency, vnode) {
	const output = new Array(siblings);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, siblings) }, async () => {
			while (true) {
				const index = next++;
				if (index >= siblings) return;
				output[index] = (await renderToStringAsync(vnode(), { markers: false })).html;
			}
		})
	);
	return `<section>${output.join('')}</section>`;
}
