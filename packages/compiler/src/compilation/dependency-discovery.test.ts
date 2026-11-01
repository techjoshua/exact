import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExactCompilerSession } from '../expression/project.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import {
	collectPlacementAnalysisDependencies,
	transitiveDependencies
} from './dependency-discovery.js';

describe('compilation dependency planning', () => {
	it('returns the transitive closure once in deterministic traversal order', () => {
		const graph = new Map([
			['entry', ['shared', 'feature']],
			['feature', ['shared', 'leaf']],
			['shared', ['leaf']],
			['leaf', []]
		]);

		expect(transitiveDependencies('entry', graph)).toEqual(['shared', 'feature', 'leaf']);
	});

	it('does not include disconnected modules', () => {
		expect(
			transitiveDependencies(
				'entry',
				new Map([
					['entry', ['dependency']],
					['dependency', []],
					['unrelated', []]
				])
			)
		).toEqual(['dependency']);
	});

	it.each([
		['runtime declaration companion', './value.js', 'value.d.ts', true, false, 'value.js'],
		['side-effect declaration companion', './value.js', 'value.d.ts', false, true, 'value.js'],
		['type-only declaration', './value.js', 'value.d.ts', false, false, undefined],
		['declaration without runtime', './missing.js', 'missing.d.ts', true, false, undefined],
		['native TypeScript executable', './value.js', 'value.ts', true, false, 'value.ts'],
		['native JavaScript executable', './value.js', 'value.js', true, false, 'value.js'],
		['package declaration', 'declared-package', 'value.d.ts', true, false, undefined]
	] as const)(
		'preserves runtime dependency ownership for %s',
		async (_name, specifier, resolved, runtimeBinding, sideEffectOnly, expected) => {
			const root = await createTestWorkspace('exact-declaration-dependencies-');
			const entry = path.join(root, 'entry.ts');
			await Promise.all(
				['value.js', 'value.ts', 'value.d.ts', 'missing.d.ts'].map((name) =>
					writeFile(path.join(root, name), 'export const value = 1;')
				)
			);
			const imports = [
				{
					moduleSpecifier: specifier,
					resolvedFile: path.join(root, resolved),
					typeOnly: !runtimeBinding && !sideEffectOnly,
					runtimeBinding,
					sideEffectOnly
				}
			];
			const session = {
				compileNative: ({ id }: { id?: string }) => ({
					analysis: { imports: id === entry ? imports : [] }
				})
			} as unknown as ExactCompilerSession;
			const analysis = await collectPlacementAnalysisDependencies(new Map([[entry, '']]), session);
			expect(analysis.localDependencies.get(entry)).toEqual(
				expected ? [{ specifier, file: path.join(root, expected) }] : []
			);
			expect(analysis.graph.get(entry)).toEqual(expected ? [path.join(root, expected)] : []);
			expect(imports[0]!.resolvedFile).toBe(path.join(root, resolved));
		}
	);

	it('retains native import facts for artifact rewriting without a second source parse', async () => {
		const root = await createTestWorkspace('exact-native-dependencies-');
		const entry = path.join(root, 'entry.ts');
		const dependency = path.join(root, 'dependency.ts');
		await mkdir(root, { recursive: true });
		await writeFile(entry, 'export const entry = true;');
		await writeFile(dependency, 'export const dependency = true;');
		const requests: string[] = [];
		const session = {
			hasNativeCompiler: () => true,
			compileNative: ({ id }: { id?: string }) => {
				requests.push(id!);
				return {
					analysis: {
						imports: id === entry ? [{ moduleSpecifier: './dependency.js' }] : []
					}
				};
			}
		} as unknown as ExactCompilerSession;

		const analysis = await collectPlacementAnalysisDependencies(
			new Map([[entry, 'export const entry = true;']]),
			session
		);

		expect(requests).toEqual([entry, dependency]);
		expect(analysis.graph.get(entry)).toEqual([dependency]);
		expect(analysis.localDependencies.get(entry)).toEqual([
			{ specifier: './dependency.js', file: dependency }
		]);
	});
});
