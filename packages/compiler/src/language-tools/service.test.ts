import { describe, expect, it } from 'vitest';
import type {
	ExactNativeLanguageClient,
	NativeCompilerRequest,
	NativeCompilerResponse
} from '../compilation/compiler.js';
import { ExactCompilerLanguageService } from './service.js';

describe('ExactCompilerLanguageService', () => {
	it('publishes immutable compiler regions for unsaved source without emitting files', async () => {
		const client = new FakeNativeClient();
		const service = new ExactCompilerLanguageService(
			{ root: process.cwd(), noEmit: true },
			{ nativeClient: client }
		);
		const source =
			'import { TaskContext } from "@exactjs/core";\nexport async function ProductPage(this: Component<any>, props: { id: string }) {\n\tthis.state.product = await loadProduct(props.id);\n\tconst runFixtureTask = (_task: TaskContext = TaskContext.client()) => document.title = \'Product\';\nrunFixtureTask();\n\treturn () => <h1>{this.state.product.name}</h1>;\n}';
		const update = await service.synchronize([
			{ kind: 'upsert', filename: 'ProductPage.tsx', version: 1, source }
		]);
		const inspection = await service.inspect('ProductPage.tsx');
		const entities = inspection.components[0]!.children.flatMap((entity) => [
			entity,
			...entity.children
		]);

		expect(update.generation).toBe(1);
		expect(update.changedFiles[0]).toMatch(/ProductPage\.tsx$/);
		expect(inspection.generation).toBe(1);
		expect(entities.map((entity) => entity.kind)).toEqual(
			expect.arrayContaining(['initializer', 'render', 'inferred-task', 'explicit-task'])
		);
		expect(
			entities.find((entity) => entity.kind === 'inferred-task')?.classification
		).toMatchObject({
			kind: 'task',
			origin: 'inferred',
			readiness: 'blocking',
			cancellation: 'generation-abort-signal'
		});
		expect(client.requests.every((request) => request.kind !== 'compile')).toBe(true);
		await service.dispose();
	});

	it('ignores older document versions and rejects stale refactor generations', async () => {
		const service = new ExactCompilerLanguageService(
			{ root: process.cwd() },
			{ nativeClient: new FakeNativeClient() }
		);
		const source =
			'import { TaskContext } from "@exactjs/core";\nexport function Page(this: Component<any>) {\n\tconst runFixtureTask = (_task: TaskContext = TaskContext.client()) => document.title = \'Page\';\nrunFixtureTask();\n\treturn () => <main />;\n}';
		await service.synchronize([{ kind: 'upsert', filename: 'Page.tsx', version: 2, source }]);
		const ignored = await service.synchronize([
			{ kind: 'upsert', filename: 'Page.tsx', version: 1, source: 'invalid' }
		]);
		expect(ignored.changedFiles).toEqual([]);
		await expect(
			service.refactor({
				generation: 1,
				filename: 'Page.tsx',
				range: { start: 0, end: source.length },
				kind: 'convert-to-inferred-task'
			})
		).rejects.toThrow('Stale eXact refactor generation');
	});
});

class FakeNativeClient implements ExactNativeLanguageClient {
	readonly requests: NativeCompilerRequest[] = [];

	async request<T extends NativeCompilerResponse = NativeCompilerResponse>(
		request: NativeCompilerRequest,
		signal?: AbortSignal
	): Promise<T> {
		if (signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
		this.requests.push(request);
		return responseFor(request.id ?? 'input.tsx', request.source ?? '') as T;
	}

	async dispose(): Promise<void> {}
}

function responseFor(filename: string, source: string): NativeCompilerResponse {
	const name = source.includes('ProductPage') ? 'ProductPage' : 'Page';
	const taskMatches = [
		...[...source.matchAll(/\bawait\s+/g)].map((match) => ({ match, client: false })),
		...[
			...source.matchAll(/\([^)]*TaskContext\s*=\s*TaskContext\.client\(\)[^)]*\)\s*=>[^;]*;/g)
		].map((match) => ({ match, client: true }))
	];
	const tasks = taskMatches.map(({ match, client }, index) => ({
		id: `${name}:task:${index}`,
		component: name,
		facets: client ? ['client'] : [],
		priority: 'normal' as const,
		readiness: client ? ('nonblocking' as const) : ('blocking' as const),
		placement: client ? ('client' as const) : ('server' as const),
		async: true,
		browserEffects: client,
		serverEffects: !client,
		environmentEffect: client ? ('browser' as const) : ('server' as const),
		reactiveDependencies: [],
		dependencies: client ? [] : [{ index: 0, source: 'props' as const }],
		capturedParameters: [],
		capturedInputs: [],
		reads: [],
		writes: !client
			? [{ path: 'state.product', kind: 'write' as const, confidence: 'exact' as const }]
			: [],
		contexts: [],
		effectSources: [
			{
				environment: client ? ('browser' as const) : ('server' as const),
				description: client ? 'document is a browser API' : 'loadProduct is server-resident',
				path: []
			}
		],
		resources: [],
		signalCalls: [],
		diagnostics: [],
		start: match.index,
		length: match[0].length,
		...(client
			? { functionDefined: true, workStart: match.index, workLength: match[0].length }
			: {})
	}));
	return {
		id: filename,
		protocolVersion: '1.26.0',
		typescriptVersion: '7.0.0',
		backendVersion: '1.26.0',
		diagnostics: [],
		analysis: {
			imports: [],
			components: [
				{
					id: name,
					name,
					start: 0,
					length: source.length,
					exported: true,
					signals: ['this'],
					placement: 'isomorphic',
					subgraphPlacement: 'isomorphic',
					environmentEffect: 'neutral',
					artifactTargets: ['client', 'server'],
					renderEdges: [],
					clientIslandCount: 0,
					contexts: [],
					splitBoundaries: [],
					diagnostics: []
				}
			],
			jsx: [],
			stateAliases: [],
			stateReads: [],
			stateWrites: [],
			reactiveBindings: [],
			callables: [],
			tasks,
			exports: [],
			symbols: [],
			boundaries: [],
			continuations: [],
			resumptions: [],
			policy: { version: 1, subjects: [], flows: [], secretConsumers: [] },
			requiredCapabilities: { rawHtml: [] },
			assets: [],
			semanticGraph: { scopes: [], declarations: [], references: [], exports: [] }
		},
		timings: {
			parseMicroseconds: 0,
			programMicroseconds: 0,
			analysisMicroseconds: 0,
			sourceMicroseconds: 0,
			callableMicroseconds: 0,
			policyTaskMicroseconds: 0,
			projectLinkMicroseconds: 0,
			checkMicroseconds: 0,
			loweringMicroseconds: 0,
			extensionMicroseconds: 0,
			printMicroseconds: 0,
			totalMicroseconds: 0
		}
	};
}
