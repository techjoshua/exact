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
