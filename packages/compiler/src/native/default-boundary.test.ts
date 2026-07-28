import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectArtifacts } from '../compilation/artifact-compilation.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('default native compiler boundary', () => {
	it('owns multi-file discovery and compilation in one native project', async () => {
		const root = await createTestWorkspace('exact-native-boundary-');
		const sourceRoot = path.join(root, 'src');
		const entry = path.join(sourceRoot, 'entry.tsx');
		const dependency = path.join(sourceRoot, 'dependency.tsx');
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(
			entry,
			'import { Dependency } from "./dependency.js"; export const Entry = () => <Dependency />;'
		);
		await writeFile(
			dependency,
			'export function Dependency() { return () => <span>dependency</span>; }'
		);
		const results = await compileProjectArtifacts([entry], {
			outDir: path.join(root, 'native'),
			rootDir: sourceRoot
		});

		expect(results.map((result) => path.basename(result.inputFile)).sort()).toEqual([
			'dependency.tsx',
			'entry.tsx'
		]);
	});
});
