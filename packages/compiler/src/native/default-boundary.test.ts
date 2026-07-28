import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compileProjectArtifacts } from '../compilation/artifact-compilation.js';
import { createTestWorkspace } from '../test-support/workspace.js';

const compilerBoundaryCalls = vi.hoisted(() => ({
	createExpressionProject: 0,
	createSourceFile: 0
}));
vi.mock('@exactjs/expressions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@exactjs/expressions')>();
	return {
		...actual,
		createExpressionProject: (...arguments_: Parameters<typeof actual.createExpressionProject>) => {
			compilerBoundaryCalls.createExpressionProject++;
			return actual.createExpressionProject(...arguments_);
		}
	};
});
vi.mock('typescript', async (importOriginal) => {
	const actual = await importOriginal<typeof import('typescript')>();
	const typeScript = (actual as unknown as { default: typeof import('typescript') }).default;
	return {
		...actual,
		default: new Proxy(typeScript, {
			get(target, property, receiver) {
				if (property !== 'createSourceFile') return Reflect.get(target, property, receiver);
				return (...arguments_: Parameters<typeof target.createSourceFile>) => {
					compilerBoundaryCalls.createSourceFile++;
					return target.createSourceFile(...arguments_);
				};
			}
		})
	};
});

describe('default native compiler boundary', () => {
	it('does not reconstruct source syntax through the JavaScript TypeScript API', async () => {
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
		await compileProjectArtifacts([entry], {
			outDir: path.join(root, 'native'),
			rootDir: sourceRoot
		});

		expect(compilerBoundaryCalls).toEqual({
			createExpressionProject: 0,
			createSourceFile: 0
		});
	});
});
