import process from 'node:process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVNode, markExactComponent } from '../../packages/core/dist/index.js';
import { createExactLanguageService } from '../../packages/compiler/dist/index.js';
import { jsx } from '../../packages/jsx-runtime/dist/jsx-runtime.js';
import {
	diffKeyedListItems,
	parseKeyedListSnapshotHtml,
	renderKeyedListSnapshot,
	renderToString
} from '../../packages/ssr/dist/index.js';

function measureSsrOwnership(width, depth) {
	const wide = measureRender(createVNode(WideTree, { count: width }));
	const deep = measureRender(createVNode(DeepTree, { depth }));
	return {
		metrics: {
			wideRenderMs: wide.elapsedMs,
			widePeakHeapBytes: wide.peakBytes,
			wideRetainedHeapBytes: wide.retainedBytes,
			deepRenderMs: deep.elapsedMs,
			deepPeakHeapBytes: deep.peakBytes,
			deepRetainedHeapBytes: deep.retainedBytes
		}
	};
}

function measureRender(vnode) {
	globalThis.gc();
	const baseline = process.memoryUsage().heapUsed;
	let peak = baseline;
	const started = performance.now();
	const result = renderToString(vnode, {
		markers: false,
		onComponentCreated() {
			peak = Math.max(peak, process.memoryUsage().heapUsed);
		}
	});
	const elapsedMs = performance.now() - started;
	if (!result.html) throw new Error('SSR ownership workload produced no output');
	globalThis.gc();
	return {
		elapsedMs,
		peakBytes: Math.max(0, peak - baseline),
		retainedBytes: Math.max(0, process.memoryUsage().heapUsed - baseline)
	};
}

const Leaf = markExactComponent(function Leaf(props) {
	return () => createVNode('span', null, String(props.index));
}, '@exactjs/performance:ssr-leaf');

const WideTree = markExactComponent(function WideTree(props) {
	return () =>
		createVNode(
			'main',
			null,
			...Array.from({ length: props.count }, (_, index) => createVNode(Leaf, { index }))
		);
}, '@exactjs/performance:ssr-wide');

const DeepTree = markExactComponent(function DeepTree(props) {
	return () =>
		props.depth === 0
			? createVNode('span', null, 'leaf')
			: createVNode(DeepTree, { depth: props.depth - 1 });
}, '@exactjs/performance:ssr-deep');

async function measureLanguageCache(bounded) {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-language-performance-'));
	const collect = globalThis.gc;
	if (!collect) throw new Error('language-cache requires --expose-gc');
	const service = createExactLanguageService({
		root,
		maxCachedAnalyses: bounded ? 32 : 10_000,
		maxCachedAnalysisBytes: bounded ? 8 * 1024 * 1024 : 1024 * 1024 * 1024
	});
	try {
		const plateau = [];
		for (let batch = 0; batch < 4; batch++) {
			const changes = [];
			for (let offset = 0; offset < 40; offset++) {
				const index = batch * 40 + offset;
				const filename = `Page${index}.tsx`;
				const source = `export function Page${index}() { return () => <main>${'x'.repeat(2_048)}</main>; }`;
				await writeFile(path.join(root, filename), source);
				changes.push({ kind: 'upsert', filename, version: 1, source });
			}
			await service.synchronize(changes);
			await service.synchronize(changes.map(({ filename }) => ({ kind: 'close', filename })));
			collect();
			plateau.push(process.memoryUsage().heapUsed);
		}
		const warmInspectionSamples = [];
		for (let index = 0; index < 25; index++) {
			const started = performance.now();
			await service.inspect('Page159.tsx');
			if (index >= 5) warmInspectionSamples.push(performance.now() - started);
		}
		warmInspectionSamples.sort((left, right) => left - right);
		const stats = service.stats();
		return {
			metrics: {
				plateauHeapBytes: plateau.at(-1),
				plateauGrowthBytes: plateau.at(-1) - plateau.at(-2),
				analysisEntries: stats.analysisEntries,
				analysisEstimatedBytes: stats.analysisEstimatedBytes,
				evictions: stats.analysisEvictions,
				warmInspectionP95Ms:
					warmInspectionSamples[Math.ceil(warmInspectionSamples.length * 0.95) - 1]
			}
		};
	} finally {
		await service.dispose();
		await rm(root, { recursive: true, force: true });
	}
}

function measureKeyedSnapshot(count) {
	if (!globalThis.gc) throw new Error('keyed-snapshot requires --expose-gc');
	globalThis.gc();
	const baseline = process.memoryUsage().heapUsed;
	const records = Array.from({ length: count }, (_, index) => ({
		id: String(index),
		value: `${index}:${'x'.repeat(192)}`
	}));
	const renderStarted = performance.now();
	const snapshot = renderKeyedListSnapshot({
		listId: 'performance-list',
		items: records,
		key: (item) => item.id,
		render: (item) => createVNode('li', null, item.value)
	});
	const renderMs = performance.now() - renderStarted;
	globalThis.gc();
	const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - baseline);
	const parseStarted = performance.now();
	const parsed = parseKeyedListSnapshotHtml('performance-list', snapshot.innerHtml, {
		maxBytes: snapshot.innerHtml.length + 256,
		maxItems: count + 1,
		maxMarkers: count * 2 + 1
	});
	const parseMs = performance.now() - parseStarted;
	if (!parsed) throw new Error('keyed snapshot failed to parse');
	const next = [...snapshot.items];
	const last = next.pop();
	if (!last) throw new Error('keyed snapshot requires records');
	next.unshift(last);
	const diffStarted = performance.now();
	const patches = diffKeyedListItems('performance-list', parsed.items, next);
	const diffMs = performance.now() - diffStarted;
	if (patches.length !== 1) throw new Error('keyed snapshot rotation did not produce one patch');
	return { metrics: { renderMs, retainedHeapBytes, parseMs, diffMs } };
}

function measureCompiledCells(count) {
	if (!globalThis.gc) throw new Error('compiled-cells requires --expose-gc');
	globalThis.gc();
	const baseline = process.memoryUsage().heapUsed;
	const started = performance.now();
	const cells = Array.from({ length: count }, (_, index) =>
		jsx('span', { children: String(index) })
	);
	const createMs = performance.now() - started;
	globalThis.gc();
	const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - baseline);
	if (cells.length !== count || cells.at(-1)?.type === undefined)
		throw new Error('compiled cell population was not retained');
	return { metrics: { createMs, retainedHeapBytes, cells: count } };
}

function measureMountedLayout(layout, count) {
	if (!globalThis.gc) throw new Error('mounted-layout requires --expose-gc');
	globalThis.gc();
	const baseline = process.memoryUsage().heapUsed;
	const records = Array.from({ length: count }, (_, index) => {
		const kind = index % 10 < 6 ? 'host' : index % 10 < 9 ? 'text' : 'component';
		const base = { kind, vnode: index, dom: index, scope: index, children: [] };
		if (layout === 'header')
			return {
				...base,
				instance: kind === 'component' ? index : undefined,
				stop: kind === 'text' ? index : undefined,
				afterPlacement: undefined
			};
		if (kind === 'component') return { ...base, instance: index, afterPlacement: undefined };
		if (kind === 'text') return { ...base, stop: index, afterPlacement: undefined };
		return { ...base, afterPlacement: undefined };
	});
	globalThis.gc();
	const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - baseline);
	let checksum = 0;
	const started = performance.now();
	for (let pass = 0; pass < 20; pass++) {
		for (const record of records) {
			if (layout === 'specialized') {
				if (record.kind === 'component') checksum += record.instance ?? 0;
				else if (record.kind === 'text') checksum += record.stop ?? 0;
				else checksum += record.dom;
			} else checksum += record.dom + (record.instance ?? 0) + (record.stop ?? 0);
		}
	}
	const accessMs = performance.now() - started;
	if (checksum === 0) throw new Error('mounted layout workload was optimized away');
	return { metrics: { accessMs, retainedHeapBytes, records: count } };
}

const scenario = process.argv[2];
if (scenario === 'ssr-ownership') {
	if (!globalThis.gc) throw new Error('ssr-ownership requires --expose-gc');
	for (let index = 0; index < 2; index++) measureSsrOwnership(2_000, 250);
	process.stdout.write(`${JSON.stringify(measureSsrOwnership(2_000, 250))}\n`);
} else if (scenario === 'language-cache') {
	const bounded = process.argv[3] !== 'unbounded';
	for (let index = 0; index < 2; index++) await measureLanguageCache(bounded);
	process.stdout.write(`${JSON.stringify(await measureLanguageCache(bounded))}\n`);
} else if (scenario === 'keyed-snapshot') {
	for (let index = 0; index < 2; index++) measureKeyedSnapshot(5_000);
	process.stdout.write(`${JSON.stringify(measureKeyedSnapshot(5_000))}\n`);
} else if (scenario === 'compiled-cells') {
	for (let index = 0; index < 2; index++) measureCompiledCells(100_000);
	process.stdout.write(`${JSON.stringify(measureCompiledCells(100_000))}\n`);
} else if (scenario === 'mounted-layout') {
	const layout = process.argv[3] ?? 'current';
	for (let index = 0; index < 2; index++) measureMountedLayout(layout, 250_000);
	process.stdout.write(`${JSON.stringify(measureMountedLayout(layout, 250_000))}\n`);
} else {
	throw new Error(`Unknown remaining optimization scenario ${scenario ?? '<missing>'}`);
}
