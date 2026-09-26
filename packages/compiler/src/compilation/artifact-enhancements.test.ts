import { compileProjectArtifacts } from './artifact-compilation.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { transformSource } from './transformation.js';
import { linkArtifactEnhancements } from './artifact-enhancements.js';
import {
	exactEnhancementFacadeRequest,
	parseExactEnhancementFacadeRequest
} from './enhancement-facades.js';

it('relocates optional edges without losing authored identity or source-map columns', () => {
	const input = path.resolve('src/page.tsx');
	const output = path.resolve('generated/page.exact.client.ts');
	const original = transformSource('export const answer = 42;', {
		filename: input,
		sourceMap: true
	});
	const result = linkArtifactEnhancements(
		{
			...original,
			rendererEnhancements: [
				{
					identity: './provider.js#default',
					moduleSpecifier: './provider.js',
					exportName: 'default'
				}
			]
		},
		input,
		output
	);
	const encoded = result.code.match(/"(exact:optional-enhancement\/[^"\s]+)"/)![1]!;
	expect(parseExactEnhancementFacadeRequest(encoded)).toMatchObject({
		identity: './provider.js#default',
		moduleSpecifier: '../src/provider.js'
	});
	const prefix = result.code.slice(0, -original.code.length);
	expect(result.map?.mappings).toBe(
		';'.repeat(prefix.split('\n').length - 1) + original.map!.mappings
	);
	expect(result.map?.sourcesContent).toEqual(original.map?.sourcesContent);
	const aliased = linkArtifactEnhancements(
		{
			...original,
			rendererEnhancements: result.rendererEnhancements!.map((edge) => ({
				...edge,
				moduleSpecifier: './provider.js'
			}))
		},
		input,
		output,
		{ moduleAliases: { './provider.js': './provider.exact.client.js' } }
	);
	expect(aliased.rendererEnhancements?.[0]?.moduleSpecifier).toBe('./provider.exact.client.js');
});

it('links relative providers to their emitted target rather than the source directory', async () => {
	const root = await createTestWorkspace('.exact-relative-enhancement-', process.cwd());
	const files = await writeTestFiles(root, {
		'provider.tsx': "export { default } from './tone.js' with { type: 'exact-enhancement' };",
		'tone.tsx':
			'export default function Tone(props: { active?: boolean; children?: unknown }) { return () => <aside>{props.children}</aside>; }',
		'page.tsx': `import tone from './provider.js' with { type: 'exact-enhancement' }; export function Page() { return () => <p tone:active>content</p>; }`
	});
	const results = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'out')
	});
	const page = results.find((result) => result.inputFile === files['page.tsx'])!;
	for (const target of ['client', 'server'] as const) {
		expect(page[target].rendererEnhancements).toEqual([
			{
				identity: './provider.js#default',
				moduleSpecifier: `./provider.exact.${target}.js`,
				exportName: 'default'
			}
		]);
	}
	expect(results.some((result) => result.inputFile === files['provider.tsx'])).toBe(true);
	// Standalone TS consumers see typed optional edges even with multiple references to the same
	// provider. Resolving its runtime implementation remains the consuming adapter's responsibility.
	const program = ts.createProgram(
		results.flatMap((result) => [result.clientFile, result.serverFile]),
		{
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			noEmit: true,
			strict: true,
			skipLibCheck: false,
			types: ['node']
		}
	);
	expect(
		ts
			.getPreEmitDiagnostics(program)
			.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
	).toEqual([]);
});

// Deferred provider edges must not become eager renderer registration dependencies.
it.each([false, true])(
	'preserves optional enhancement import timing (deferred=%s)',
	async (deferred) => {
		const root = await createTestWorkspace('.exact-deferred-enhancement-', process.cwd());
		const edge = {
			identity: '@fixture/provider#default',
			moduleSpecifier: '@fixture/provider',
			exportName: 'default'
		};
		const request = JSON.stringify(exactEnhancementFacadeRequest(edge));
		const files = await writeTestFiles(root, {
			'entry.ts': deferred
				? `export function load() { return import(${request}); }`
				: `import provider from ${request}; export { provider };`
		});
		const [result] = await compileProjectArtifacts([files['entry.ts']!], {
			rootDir: root,
			outDir: path.join(root, 'out')
		});
		for (const target of ['client', 'server'] as const) {
			const artifact = result![target];
			expect(artifact.rendererEnhancements ?? []).toEqual(deferred ? [] : [edge]);
			if (deferred) {
				expect(artifact.code).toContain('import(');
				expect(artifact.code).not.toContain('registerExactEnhancement');
			} else expect(artifact.code).toContain('registerExactEnhancement');
		}
	}
);
