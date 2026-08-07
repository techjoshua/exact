import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2];
if (!executable) {
	throw new Error(
		'Usage: node scripts/test-native-compiler-process.mjs <exactc-native executable>'
	);
}

const compilerModule = await import(
	pathToFileURL(path.join(repositoryRoot, 'packages/compiler/dist/native/process.js')).href
);
const compiler = new compilerModule.NativeCompilerProcess({
	executable: path.resolve(executable)
});

try {
	const request = {
		id: 'component.tsx',
		kind: 'compile',
		source: 'export function Panel() { const value: number = 1; return () => <main />; }',
		diagnostics: 'syntax'
	};
	const first = compiler.request(request);
	assert.equal(first.protocolVersion, '1.28.0');
	assert.match(first.typescriptVersion, /^7\./);
	assert.equal(first.backendVersion, first.protocolVersion);
	assert.equal(first.cacheHit, undefined);
	assert.deepEqual(first.diagnostics, []);
	assert.match(first.code, /const value: number = 1/);
	assert.deepEqual(first.analysis.components, [
		{
			id: 'xUe2-1EODUcoRs7LuYoY2GZ',
			name: 'Panel',
			start: 0,
			length: request.source.length,
			exported: true,
			signals: ['named-jsx'],
			placement: 'isomorphic',
			subgraphPlacement: 'isomorphic',
			environmentEffect: 'neutral',
			artifactTargets: ['client', 'server'],
			renderEdges: [],
			clientIslandCount: 0,
			contexts: [],
			enhancementContexts: { provides: [], requires: [], optionallyConsumes: [] },
			splitBoundaries: [],
			diagnostics: []
		}
	]);
	const rewritten = compiler.request({
		id: 'module.ts',
		kind: 'compile',
		source:
			'import { value } from "./dependency.js"; import { legacy } from "legacy"; export const loaded = import("./lazy.js"); console.log(value, legacy);',
		moduleRewrite: {
			moduleAliases: {
				'./dependency.js': './dependency.exact.client.js',
				'./lazy.js': './lazy.exact.client.js'
			},
			replacements: [
				{
					sourceModule: 'legacy',
					sourceExport: 'legacy',
					targetModule: 'native',
					targetExport: 'replacement'
				}
			]
		}
	});
	assert.match(rewritten.code, /from "\.\/dependency\.exact\.client\.js"/);
	assert.match(rewritten.code, /import\("\.\/lazy\.exact\.client\.js"\)/);
	assert.match(rewritten.code, /import \{ replacement as legacy \} from "native"/);

	const second = compiler.request(request);
	assert.equal(second.cacheHit, true);

	const empty = compiler.request({
		id: 'empty.ts',
		kind: 'compile',
		source: 'export const value = 1;'
	});
	assert.deepEqual(empty.analysis, {
		imports: [],
		components: [],
		jsx: [],
		stateAliases: [],
		stateReads: [],
		stateWrites: [],
		valueBindings: [],
		reactiveBindings: [],
		callables: [],
		tasks: [],
		exports: [{ name: 'value', kind: 'value', placement: 'isomorphic' }],
		symbols: [
			{
				id: 'xShr0mq6wzSl2Q_DHFYdF-m',
				exportName: 'value',
				localName: 'value',
				generatedName: 'value',
				debugName: 'value',
				kind: 'value',
				role: 'root',
				target: 'both',
				placement: 'isomorphic'
			}
		],
		boundaries: [],
		continuations: [],
		registries: [],
		rendererEnhancements: [],
		partitionPlan: {
			version: 1,
			buildKey: 'xnJFRGpvxTmVuQ_9xmOcuF_',
			roots: [],
			nodes: [],
			edges: []
		},
		resumptions: [],
		policy: { version: 1, subjects: [], flows: [], secretConsumers: [] },
		requiredCapabilities: { rawHtml: [] },
		assets: [],
		semanticGraph: {
			scopes: [{ id: 'empty.ts:scope:module', kind: 'module', nodeKind: 'SourceFile' }],
			declarations: [
				{
					id: 'empty.ts:declaration:12',
					name: 'value',
					scopeId: 'empty.ts:scope:module',
					kind: 'variable',
					nodeStart: 12,
					nodeEnd: 18,
					exportedName: 'value'
				}
			],
			references: [],
			exports: [{ exportedName: 'value', localName: 'value' }]
		}
	});

	const invalid = compiler.request({
		...request,
		diagnostics: 'semantic',
		source: 'export function Panel() { const value: number = "wrong"; return () => <main />; }'
	});
	assert.equal(invalid.cacheHit, undefined);
	assert.equal(invalid.diagnostics[0]?.code, 'TS2322');
	assert.throws(
		() => compiler.request({ kind: 'unsupported' }),
		/unsupported native compiler request kind.*TypeScript 7\..*eXact native backend 1\.28\.0/
	);
} finally {
	compiler.dispose();
}

const publicCompiler = await import(
	pathToFileURL(path.join(repositoryRoot, 'packages/compiler/dist/index.js')).href
);
const internalCompiler = await import(
	pathToFileURL(path.join(repositoryRoot, 'packages/compiler/dist/internal.js')).href
);
const session = publicCompiler.createCompilerSession({
	nativeCompiler: { executable: path.resolve(executable) }
});
try {
	const result = publicCompiler.transformSource(
		'export function NativePanel() { return () => <button onClick={() => alert(1)}>Go</button>; }',
		{
			filename: 'native-panel.tsx',
			target: 'client',
			serverComponents: true,
			sourceMap: true,
			session
		}
	);
	const resultAnalysis = internalCompiler.analyzeSource(
		'export function NativePanel() { return () => <button onClick={() => alert(1)}>Go</button>; }',
		{ filename: 'native-panel.tsx', serverComponents: true, session }
	);
	assert.match(result.code, /createCompiledVNode/);
	assert.equal(resultAnalysis.components[0]?.name, 'NativePanel');
	assert.equal(
		resultAnalysis.symbols.some((symbol) => symbol.role === 'root'),
		true
	);
	assert.equal(
		resultAnalysis.boundaries.some((boundary) => boundary.kind === 'client-island'),
		true
	);
	assert.equal(result.map?.version, 3);
	assert.equal(result.map?.sourcesContent?.[0]?.includes('NativePanel'), true);
	assert.equal(typeof result.map?.mappings, 'string');

	const htmlLibrary = internalCompiler.analyzeSource(
		'import { unsafeHtml } from "@exactjs/core"; export function article(value: string) { return unsafeHtml(value); }',
		{
			filename: 'article.ts',
			packageType: 'library',
			packageName: '@scope/article',
			session
		}
	);
	assert.equal(htmlLibrary.requiredCapabilities?.rawHtml.length, 1);

	const assetResult = publicCompiler.transformSource(
		'import "./app.scss"; import poster from "./poster.avif?url"; export const asset = poster;',
		{
			filename: 'assets.ts',
			target: 'server',
			assetRules: [{ extensions: ['.avif'], queries: ['url'], kind: 'image', importMode: 'url' }],
			session
		}
	);
	const assetAnalysis = internalCompiler.analyzeSource(
		'import "./app.scss"; import poster from "./poster.avif?url"; export const asset = poster;',
		{
			filename: 'assets.ts',
			target: 'server',
			assetRules: [{ extensions: ['.avif'], queries: ['url'], kind: 'image', importMode: 'url' }],
			session
		}
	);
	assert.equal(assetResult.code.includes('./app.scss'), false);
	assert.equal(assetResult.code.includes('./poster.avif?url'), true);
	assert.equal(assetAnalysis.assets.length, 2);

	const artifactRoot = await mkdtemp(path.join(os.tmpdir(), 'exact-native-artifacts-'));
	try {
		const input = path.join(artifactRoot, 'panel.tsx');
		const outDir = path.join(artifactRoot, 'out');
		await writeFile(
			input,
			`import { TaskContext } from '@exactjs/core';
			export function Panel(this: Component<{ count: number }>) {
				async function load(_task: TaskContext = TaskContext.server()) { await loadPanel(); }
				load();
				return () => <button onClick={() => this.state.count++}>Go</button>;
			}`
		);
		const artifacts = await publicCompiler.compileFileArtifacts(input, {
			outDir,
			rootDir: artifactRoot,
			session,
			serverComponents: true
		});
		assert.match(await readFile(artifacts.clientFile, 'utf8'), /Panel_ExactClient_1/);
		assert.match(await readFile(artifacts.serverFile, 'utf8'), /createServerBoundary/);
		assert.equal(artifacts.build.clientRegistrations.length > 0, true);
	} finally {
		await rm(artifactRoot, { recursive: true, force: true });
	}
	session.clear();
} finally {
	session.dispose();
}

console.log('native compiler process integration ok');
