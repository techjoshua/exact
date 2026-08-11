import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

	it('pins overlays while evicting cold disk analyses within count and byte budgets', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-language-cache-'));
		try {
			const filenames = ['First.tsx', 'Second.tsx', 'Pinned.tsx'];
			for (const filename of filenames)
				await writeFile(
					path.join(root, filename),
					`export function Page() { return () => <p>${filename}</p>; }`
				);
			const service = new ExactCompilerLanguageService(
				{ root, maxCachedAnalyses: 1, maxCachedAnalysisBytes: 1_000_000 },
				{ nativeClient: new FakeNativeClient() }
			);
			try {
				for (const filename of filenames.slice(0, 2)) {
					const source = `export function Page() { return () => <p>${filename}</p>; }`;
					await service.synchronize([{ kind: 'upsert', filename, version: 1, source }]);
					await service.synchronize([{ kind: 'close', filename }]);
				}
				const pinnedSource = 'export function Page() { return () => <p>pinned</p>; }';
				await service.synchronize([
					{ kind: 'upsert', filename: 'Pinned.tsx', version: 1, source: pinnedSource }
				]);

				expect(service.stats()).toMatchObject({
					overlays: 1,
					snapshotEntries: 1,
					analysisEntries: 1,
					analysisEvictions: 2,
					cacheOverBudget: false
				});
				await service.inspect('First.tsx');
				expect(service.stats().analysisEvictions).toBe(3);
			} finally {
				await service.dispose();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('rejects invalid language analysis cache limits', () => {
		expect(
			() =>
				new ExactCompilerLanguageService(
					{ root: process.cwd(), maxCachedAnalyses: 0 },
					{ nativeClient: new FakeNativeClient() }
				)
		).toThrow('maxCachedAnalyses must be a positive safe integer');
	});

	it('reports pinned overlays above a byte budget and evicts by access order', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-language-lru-'));
		const filenames = ['A.tsx', 'B.tsx', 'C.tsx'];
		try {
			for (const filename of filenames)
				await writeFile(path.join(root, filename), `export const value = '${filename}';`);
			const service = new ExactCompilerLanguageService(
				{ root, maxCachedAnalyses: 2, maxCachedAnalysisBytes: 1_000_000 },
				{ nativeClient: new FakeNativeClient() }
			);
			try {
				for (const filename of filenames.slice(0, 2)) {
					const source = `export const value = '${filename}';`;
					await service.synchronize([{ kind: 'upsert', filename, version: 1, source }]);
					await service.synchronize([{ kind: 'close', filename }]);
				}
				await service.inspect('A.tsx');
				const source = `export const value = 'C.tsx';`;
				await service.synchronize([{ kind: 'upsert', filename: 'C.tsx', version: 1, source }]);
				await service.synchronize([{ kind: 'close', filename: 'C.tsx' }]);
				expect(service.stats().analysisEvictions).toBe(1);
				await service.inspect('A.tsx');
				expect(service.stats().analysisEvictions).toBe(1);
				await service.inspect('B.tsx');
				expect(service.stats().analysisEvictions).toBe(2);
			} finally {
				await service.dispose();
			}

			const pinned = new ExactCompilerLanguageService(
				{ root, maxCachedAnalyses: 1, maxCachedAnalysisBytes: 1 },
				{ nativeClient: new FakeNativeClient() }
			);
			try {
				await pinned.synchronize([
					{
						kind: 'upsert',
						filename: 'A.tsx',
						version: 1,
						source: `export const value = 'pinned';`
					}
				]);
				expect(pinned.stats().cacheOverBudget).toBe(true);
				await pinned.synchronize([{ kind: 'close', filename: 'A.tsx' }]);
				expect(pinned.stats().cacheOverBudget).toBe(false);
			} finally {
				await pinned.dispose();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
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
		protocolVersion: '1.33.0',
		typescriptVersion: '7.0.0',
		backendVersion: '1.33.0',
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
					diagnostics: [],
					execution: { version: 1, ports: [], transitions: [], reactive: [] }
				}
			],
			jsx: [],
			stateAliases: [],
			stateReads: [],
			stateWrites: [],
			valueBindings: [],
			reactiveBindings: [],
			callables: [],
			tasks,
			exports: [],
			symbols: [],
			boundaries: [],
			partitionPlan: { version: 1, buildKey: '', roots: [], nodes: [], edges: [] },
			continuations: [],
			rendererEnhancements: [],
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
			printMicroseconds: 0,
			totalMicroseconds: 0
		}
	};
}
