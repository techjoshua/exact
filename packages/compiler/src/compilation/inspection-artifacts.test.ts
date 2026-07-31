import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

const source =
	'import { TaskContext } from "@exactjs/core";\n\nfunction Page(this: Component<{ count: number }>) {\n\tconst runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => {\n\t\tthis.state.count = await Promise.resolve(1);\n\t};\nrunFixtureTask();\n\treturn () => <button>{this.state.count}</button>;\n}\n';

describe('@exactjs/compiler: inspection artifact packaging', () => {
	it('collects source inspection once and writes one server-only immutable catalog', async () => {
		const root = await createTestWorkspace('exact-inspection-artifact-');
		const sourceRoot = path.join(root, 'src');
		const input = path.join(sourceRoot, 'page.tsx');
		const outDir = path.join(root, 'dist', 'server');
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(input, source);

		const [result] = await compileProjectArtifacts([input], {
			outDir,
			rootDir: sourceRoot,
			emitInspection: true,
			instrumentInspection: true,
			inspection: { executionRoot: 'page' }
		});

		expect(result!.inspection?.inspection.components).toHaveLength(1);
		expect(result!.inspection?.inspectionFile).toMatch(
			/[\\/]\.exact-inspection[\\/][a-f0-9]{40}\.json$/
		);
		const catalog = JSON.parse(await readFile(result!.inspection!.inspectionFile!, 'utf8'));
		expect(catalog.roots.page.files[0].path).toBe('page.tsx');
		expect(catalog.roots.page.files[0].components).toHaveLength(1);
		expect(JSON.stringify(catalog)).not.toContain(source);

		const client = await readFile(result!.clientFile, 'utf8');
		const server = await readFile(result!.serverFile, 'utf8');
		expect(client).toContain('@exactjs/devtools-runtime');
		expect(client).not.toContain('awaited-state-flow');
		expect(server).not.toContain('@exactjs/devtools-runtime');
	});

	it('keeps catalog-only client output byte-identical and derives a deterministic build key', async () => {
		const root = await createTestWorkspace('exact-catalog-only-');
		const sourceRoot = path.join(root, 'src');
		const input = path.join(sourceRoot, 'page.tsx');
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(input, source);

		const [baseline] = await compileProjectArtifacts([input], {
			outDir: path.join(root, 'baseline'),
			rootDir: sourceRoot,
			emitInspection: false,
			instrumentInspection: false
		});
		const [catalogOnly] = await compileProjectArtifacts([input], {
			outDir: path.join(root, 'catalog-one'),
			rootDir: sourceRoot,
			emitInspection: true,
			instrumentInspection: false
		});
		const [again] = await compileProjectArtifacts([input], {
			outDir: path.join(root, 'catalog-two'),
			rootDir: sourceRoot,
			emitInspection: true,
			instrumentInspection: false
		});

		expect(catalogOnly!.client.code).toBe(baseline!.client.code);
		expect(path.basename(catalogOnly!.inspection!.inspectionFile!)).toBe(
			path.basename(again!.inspection!.inspectionFile!)
		);
	});

	it('creates no catalog or inspection-only symbol in hardened output', async () => {
		const root = await createTestWorkspace('exact-hardened-inspection-');
		const sourceRoot = path.join(root, 'src');
		const input = path.join(sourceRoot, 'page.tsx');
		const outDir = path.join(root, 'dist');
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(input, source);

		const [result] = await compileProjectArtifacts([input], {
			outDir,
			rootDir: sourceRoot,
			emitInspection: false,
			instrumentInspection: false
		});

		expect(result!.inspection).toBeUndefined();
		expect(result!.client.code).not.toContain('@exactjs/devtools');
		expect(result!.server.code).not.toContain('@exactjs/devtools');
		await expect(access(path.join(outDir, '.exact-inspection'))).rejects.toThrow();
	});
});
