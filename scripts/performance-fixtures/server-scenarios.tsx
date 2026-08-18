import { TaskContext, taskTimeout, type Component } from '@exactjs/core';
import { renderToProgressiveHtmlStream, renderToString, renderToStringAsync } from '@exactjs/ssr';
import {
	defineExactBoundaryContract,
	defineExactOperationContract,
	handleExactRequest,
	type ExactServerContext
} from '@exactjs/server';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { PlannedTree } from './planned-components.js';

/** Stable server scenario identifiers emitted into baseline reports and release diagnostics. */
export const serverScenarioNames = [
	'server.ssr-sync',
	'server.ssr-async-cpu',
	'server.ssr-async-io',
	'server.ssr-planned',
	'server.ssr-progressive',
	'server.operation-request',
	'server.operation-stream'
] as const;

/** One supported compiler-produced server performance workload. */
export type ServerScenarioName = (typeof serverScenarioNames)[number];

/** Portable measurements and their explicit units for one server workload sample. */
export type ServerScenarioResult = Readonly<{
	metrics: Readonly<Record<string, number>>;
	units: Readonly<Record<string, 'bytes' | 'count' | 'ms'>>;
}>;

/** Runs one compiler-produced SSR or server-protocol performance scenario. */
export async function runServerScenario(
	name: ServerScenarioName,
	options: Readonly<{ iterations?: number }> = {}
): Promise<ServerScenarioResult> {
	switch (name) {
		case 'server.ssr-sync':
			return synchronousSsr(options.iterations ?? 500);
		case 'server.ssr-async-cpu':
			return asynchronousCpuSsr(options.iterations ?? 100_000);
		case 'server.ssr-async-io':
			return asynchronousIoSsr(options.iterations ?? 4);
		case 'server.ssr-planned':
			return plannedContinuationSsr(options.iterations ?? 64);
		case 'server.ssr-progressive':
			return progressiveSsr();
		case 'server.operation-request':
			return operationRequests(options.iterations ?? 100);
		case 'server.operation-stream':
			return operationStream(options.iterations ?? 100);
	}
}

function ServerLeaf(_props: { index: number }) {
	return () => <li data-index={_props.index}>Row {_props.index}</li>;
}

function ServerTree(_props: { count: number }) {
	return () => (
		<main>
			<h1>Server benchmark</h1>
			<ul>
				{Array.from({ length: _props.count }, (_, index) => (
					<ServerLeaf key={String(index)} index={index} />
				))}
			</ul>
		</main>
	);
}

function CpuPanel(this: Component<{ value: number }>, props: { iterations: number }) {
	this.state.value = 0;
	const calculate = async (iterations: number, _task: TaskContext = TaskContext.blocking()) => {
		await Promise.resolve();
		let value = 0;
		for (let index = 0; index < iterations; index++) value = (value + index) % 1_000_003;
		this.state.value = value;
	};
	void calculate(props.iterations);
	return () => <output>{this.state.value}</output>;
}

function IoPanel(this: Component<{ ready: boolean }>, props: { delayMs: number }) {
	this.state.ready = false;
	const load = async (task: TaskContext = TaskContext.blocking()) => {
		await new Promise<void>((resolve) => {
			taskTimeout(task.signal, resolve, props.delayMs);
		});
		this.state.ready = true;
	};
	void load();
	return () => <output>{this.state.ready ? 'ready' : 'waiting'}</output>;
}

function ProgressivePanel(this: Component<{ ready: boolean }>) {
	this.state.ready = false;
	const load = async (task: TaskContext = TaskContext.deferred()) => {
		await new Promise<void>((resolve) => {
			taskTimeout(task.signal, resolve, 1);
		});
		this.state.ready = true;
	};
	void load();
	return () => <p>{this.state.ready ? 'ready' : 'loading'}</p>;
}

function synchronousSsr(count: number): ServerScenarioResult {
	const started = performance.now();
	const result = renderToString(<ServerTree count={count} />, { markers: false });
	const elapsed = performance.now() - started;
	assert(result.html.includes('Row 499') || count < 500, 'synchronous SSR lost trailing content');
	return {
		metrics: {
			renderMs: elapsed,
			...payloadBytes('html', result.html),
			nodes: count
		},
		units: { renderMs: 'ms', ...payloadByteUnits('html'), nodes: 'count' }
	};
}

async function asynchronousCpuSsr(iterations: number): Promise<ServerScenarioResult> {
	const started = performance.now();
	const result = await renderToStringAsync(<CpuPanel iterations={iterations} />, {
		markers: false
	});
	const elapsed = performance.now() - started;
	const expected = ((iterations * (iterations - 1)) / 2) % 1_000_003;
	assert(
		result.html.includes(`>${expected}</output>`),
		`asynchronous CPU SSR did not publish component output: ${result.html}`
	);
	return {
		metrics: {
			renderMs: elapsed,
			...payloadBytes('html', result.html),
			iterations
		},
		units: { renderMs: 'ms', ...payloadByteUnits('html'), iterations: 'count' }
	};
}

async function asynchronousIoSsr(delayMs: number): Promise<ServerScenarioResult> {
	const started = performance.now();
	const result = await renderToStringAsync(
		<section>
			<IoPanel delayMs={delayMs} />
			<IoPanel delayMs={delayMs} />
			<IoPanel delayMs={delayMs} />
		</section>,
		{ markers: false }
	);
	const elapsed = performance.now() - started;
	assert(result.html.match(/ready/g)?.length === 3, 'asynchronous I/O SSR lost sibling output');
	return {
		metrics: {
			renderMs: elapsed,
			...payloadBytes('html', result.html),
			siblings: 3,
			delayMs
		},
		units: {
			renderMs: 'ms',
			...payloadByteUnits('html'),
			siblings: 'count',
			delayMs: 'ms'
		}
	};
}

async function plannedContinuationSsr(count: number): Promise<ServerScenarioResult> {
	globalThis.gc?.();
	const startingHeap = process.memoryUsage().heapUsed;
	const started = performance.now();
	const result = await renderToStringAsync(<PlannedTree count={count} />, { markers: false });
	const elapsed = performance.now() - started;
	const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - startingHeap);
	globalThis.gc?.();
	const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - startingHeap);
	assert(
		result.html.includes(`<li>${count}</li>`),
		'planned SSR lost trailing continuation output'
	);
	return {
		metrics: {
			renderMs: elapsed,
			heapGrowthBytes,
			retainedHeapBytes,
			components: count,
			...payloadBytes('html', result.html)
		},
		units: {
			renderMs: 'ms',
			heapGrowthBytes: 'bytes',
			retainedHeapBytes: 'bytes',
			components: 'count',
			...payloadByteUnits('html')
		}
	};
}

async function progressiveSsr(): Promise<ServerScenarioResult> {
	const started = performance.now();
	const reader = renderToProgressiveHtmlStream(<ProgressivePanel />, {
		markers: false,
		rootId: 'performance-root'
	}).getReader();
	const first = await reader.read();
	const firstChunkMs = performance.now() - started;
	assert(!first.done && first.value, 'progressive SSR did not emit its shell');
	const chunks = [first.value];
	while (true) {
		const next = await reader.read();
		if (next.done) break;
		chunks.push(next.value);
	}
	const completeMs = performance.now() - started;
	const payload = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	return {
		metrics: { firstChunkMs, completeMs, ...payloadBytes('stream', payload) },
		units: { firstChunkMs: 'ms', completeMs: 'ms', ...payloadByteUnits('stream') }
	};
}

async function operationRequests(iterations: number): Promise<ServerScenarioResult> {
	const context = serverContext();
	const bodies: string[] = [];
	const started = performance.now();
	for (let index = 0; index < iterations; index++) {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'invoke',
					id: 'performance-action',
					payload: { index, label: `Item ${index}`, values: [index, index + 1, index + 2] }
				}
			},
			context
		);
		assert(
			response.status === 200 && response.body,
			`operation request did not succeed: ${response.status} ${response.body ?? ''}`
		);
		bodies.push(response.body);
	}
	const elapsed = performance.now() - started;
	return {
		metrics: {
			requestsMs: elapsed,
			...payloadBytes('response', bodies.join('\n')),
			operations: iterations
		},
		units: { requestsMs: 'ms', ...payloadByteUnits('response'), operations: 'count' }
	};
}

async function operationStream(iterations: number): Promise<ServerScenarioResult> {
	const context = serverContext();
	const started = performance.now();
	const response = await handleExactRequest(
		{
			method: 'POST',
			headers: { 'x-exact-stream': '1' },
			body: {
				type: 'batch',
				operations: Array.from({ length: iterations }, (_, index) => ({
					type: 'invoke' as const,
					id: 'performance-action',
					opId: `operation-${index}`,
					payload: { index, values: [index, index + 1, index + 2] }
				}))
			}
		},
		context
	);
	assert(response.status === 200 && response.stream, 'streaming operation request did not stream');
	const reader = response.stream.getReader();
	const chunks: Uint8Array[] = [];
	while (true) {
		const next = await reader.read();
		if (next.done) break;
		chunks.push(next.value);
	}
	const elapsed = performance.now() - started;
	const payload = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	return {
		metrics: { streamMs: elapsed, ...payloadBytes('stream', payload), operations: iterations },
		units: { streamMs: 'ms', ...payloadByteUnits('stream'), operations: 'count' }
	};
}

function serverContext(): ExactServerContext {
	return {
		contract: {
			version: 1,
			invocations: {
				'performance-action': defineExactOperationContract('performance-action')
			},
			executors: {},
			boundaries: {
				'performance-boundary': defineExactBoundaryContract('performance-boundary')
			}
		},
		invocations: {
			'performance-action': async (input) => ({
				patches: [
					{
						type: 'text',
						id: 'performance-output',
						value: JSON.stringify(input.payload)
					}
				]
			})
		},
		payloadDecoders: {
			invocations: {
				'performance-action': (payload) => {
					if (!payload || typeof payload !== 'object' || Array.isArray(payload))
						throw new TypeError('Expected an operation payload object');
					return payload;
				}
			}
		},
		refreshBoundaries: {
			'performance-boundary': () => ({
				patches: [
					{
						type: 'replace',
						id: 'performance-boundary',
						html: '<section>updated</section>'
					}
				]
			})
		},
		logger: { isEnabled: () => false, log() {} },
		limits: { maxBatchOperations: 1_000, maxBatchConcurrency: 8 }
	};
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function payloadBytes(prefix: string, value: string | Uint8Array): Record<string, number> {
	const payload = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
	return {
		[`${prefix}Bytes`]: payload.byteLength,
		[`${prefix}GzipBytes`]: gzipSync(payload).byteLength,
		[`${prefix}BrotliBytes`]: brotliCompressSync(payload).byteLength
	};
}

function payloadByteUnits(prefix: string): Record<string, 'bytes'> {
	return {
		[`${prefix}Bytes`]: 'bytes',
		[`${prefix}GzipBytes`]: 'bytes',
		[`${prefix}BrotliBytes`]: 'bytes'
	};
}
