import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { createExactRuntimeInspectionOwner } from '../packages/core/dist/index.js';
import { previewExactValue } from '../packages/devtools-protocol/dist/index.js';
import { createExactClientEventStore } from '../packages/devtools-runtime/dist/client-events.js';
import { createExactClientInspectionQueryService } from '../packages/devtools-runtime/dist/query-service.js';
import { transformSource } from '../packages/compiler/dist/index.js';
import { buildDevToolsPerformanceFixture } from './performance/fixture-build.mjs';

const budgets = {
	largePreviewMs: 500,
	eventPublicationMs: 1_000,
	ssrMs: 2_000,
	federationQueryMs: 500
};
const measurements = {};

{
	const keyed = Array.from({ length: 25_000 }, (_, id) => ({ id, label: `item-${id}` }));
	const started = performance.now();
	const preview = previewExactValue(keyed, {
		limits: { maxDepth: 4, maxEntries: 250, maxBytes: 64 * 1024 }
	});
	measurements.largePreviewMs = performance.now() - started;
	assert.equal(preview.kind, 'object');
	assert.ok(JSON.stringify(preview).length < 70 * 1024);
	assert.ok(measurements.largePreviewMs < budgets.largePreviewMs);
}

{
	const owner = createExactRuntimeInspectionOwner({
		buildKey: 'a'.repeat(40),
		executionRoot: 'page'
	});
	let retained = 0;
	owner.attach('benchmark', {
		publish() {
			retained++;
		}
	});
	const component = {
		id: 'component-1',
		type: function BenchmarkComponent() {},
		domain: { executionRoot: 'page', inspection: owner }
	};
	const started = performance.now();
	for (let sequence = 0; sequence < 50_000; sequence++) {
		owner.publish({
			kind:
				sequence % 5 === 0
					? 'binding.invalidate'
					: sequence % 5 === 1
						? 'action.start'
						: sequence % 5 === 2
							? 'action.settle'
							: sequence % 5 === 3
								? 'suspense.change'
								: 'state.change',
			component,
			generation: sequence
		});
	}
	measurements.eventPublicationMs = performance.now() - started;
	assert.equal(retained, 50_000);
	assert.ok(measurements.eventPublicationMs < budgets.eventPublicationMs);
}

{
	const temporary = await mkdtemp(path.join(tmpdir(), 'exact-devtools-performance-'));
	try {
		const fixture = await buildDevToolsPerformanceFixture(temporary);
		const { renderLargeList } = await import(pathToFileURL(fixture).href);
		const started = performance.now();
		const rendered = renderLargeList(5_000);
		measurements.ssrMs = performance.now() - started;
		assert.ok(rendered.html.includes('item-4999'));
		assert.ok(measurements.ssrMs < budgets.ssrMs);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

{
	const events = createExactClientEventStore(100, 100_000);
	events.publish(runtimeEvent('client', undefined, 1));
	events.publish(runtimeEvent('server', undefined, 1));
	events.publish(runtimeEvent('server', 'branding', 1));
	events.publish(runtimeEvent('server', 'billing', 1));
	const roots = [
		root(undefined, 'page-build', 'page'),
		root('branding', 'branding-build', 'branding-root'),
		root('billing', 'billing-build', 'billing-root')
	];
	const service = createExactClientInspectionQueryService({
		sessionId: 'benchmark',
		dom: {
			attach() {},
			detach() {},
			snapshot: () => ({ roots, components: [] }),
			ownerOfElement: () => undefined,
			ownedElements: () => []
		},
		events,
		serverConnected: true,
		server: {
			open: async () => undefined,
			async query(_sessionId, request) {
				const binding = request.params?.filter?.binding;
				return {
					protocol: 1,
					id: request.id,
					ok: true,
					identity: { sessionId: 'benchmark' },
					result: [runtimeEvent('server', binding, 1)]
				};
			},
			subscribe: () => ({ closed: false, close() {} }),
			close: async () => {}
		}
	});
	const started = performance.now();
	const response = await service.request({
		protocol: 1,
		id: 'three-root',
		method: 'timeline.query',
		params: { page: { limit: 4 } }
	});
	measurements.federationQueryMs = performance.now() - started;
	assert.equal(response.ok && response.result.length, 4);
	assert.ok(measurements.federationQueryMs < budgets.federationQueryMs);
}

{
	const source =
		'export function Page(this: Component<{}>) { return () => <main>{this.state.value}</main>; }';
	const baseline = transformSource(source, {
		filename: 'src/Page.tsx',
		emitInspection: false,
		instrumentInspection: false
	});
	const catalogOnly = transformSource(source, {
		filename: 'src/Page.tsx',
		emitInspection: true,
		instrumentInspection: false
	});
	const hardened = transformSource(source, {
		filename: 'src/Page.tsx',
		emitInspection: false,
		instrumentInspection: false
	});
	assert.equal(catalogOnly.code, baseline.code);
	assert.equal(hardened.inspectionCatalog, undefined);
	for (const forbidden of [
		'@exactjs/devtools-runtime',
		'@exactjs/devtools-hook',
		'.exact-inspection',
		'registerSource',
		'markExactInspectionSource',
		'__exactInspectionSource',
		'ExactRuntimeInspection'
	])
		assert.ok(!hardened.code.includes(forbidden), `hardened output contains ${forbidden}`);
}

const report = {
	scenario: 'server-cooperative-devtools',
	measurements: Object.fromEntries(
		Object.entries(measurements).map(([name, value]) => [name, Number(value.toFixed(2))])
	),
	budgets
};
console.log(JSON.stringify(report, null, 2));
console.log(`DEVTOOLS_BENCHMARK_JSON=${JSON.stringify(report)}`);

function root(binding, buildKey, executionRoot) {
	return {
		side: 'client',
		...(binding ? { binding } : {}),
		buildKey,
		executionRoot,
		status: 'available',
		components: 1
	};
}

function runtimeEvent(side, binding, sequence) {
	return {
		protocol: 1,
		cursor: sequence.toString(36),
		sequence,
		timestamp: sequence,
		kind: 'component.mount',
		id: {
			sessionId: 'benchmark',
			side,
			...(binding ? { binding } : {}),
			buildKey: `${binding ?? 'page'}-build`,
			executionRoot: binding ? `${binding}-root` : 'page',
			componentTypeId: 'component:Benchmark',
			instanceId: `${binding ?? side}-${sequence}`
		}
	};
}
