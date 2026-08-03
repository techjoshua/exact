import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	compileArtifactPlanEntries,
	compileProjectArtifacts,
	createExactArtifactDevState,
	createExactArtifactPlan,
	diffExactArtifactPlans,
	updateExactArtifactDevState
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exactjs/compiler: artifact planning', () => {
	it('plans generated artifact paths without compiling', async () => {
		const root = await createTestWorkspace('exact-artifact-plan-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		await mkdir(path.join(src, 'components'), { recursive: true });
		await writeFile(
			path.join(src, 'components', 'panel.tsx'),
			'export function Panel() { return () => <p />; }'
		);
		await writeFile(path.join(src, 'skip.ts'), 'export const skip = 1;');

		const plan = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});

		expect(plan).toEqual({
			rootDir: src,
			entries: [
				{
					inputFile: path.join(src, 'components', 'panel.tsx'),
					clientFile: path.join(outDir, 'components', 'panel.exact.client.ts'),
					serverFile: path.join(outDir, 'components', 'panel.exact.server.ts'),
					sharedFile: path.join(outDir, 'components', 'panel.exact.shared.ts')
				}
			]
		});
	});

	it('diffs exact artifact plans for dev-server orchestration', () => {
		const previous = {
			rootDir: '/app/src',
			entries: [planEntry('/app/src/a.tsx'), planEntry('/app/src/removed.tsx')]
		};
		const next = {
			rootDir: '/app/src',
			entries: [planEntry('/app/src/a.tsx'), planEntry('/app/src/added.tsx')]
		};

		expect(diffExactArtifactPlans(previous, next)).toEqual({
			added: [planEntry('/app/src/added.tsx')],
			removed: [planEntry('/app/src/removed.tsx')],
			changed: [],
			retained: [planEntry('/app/src/a.tsx')]
		});

		expect(
			diffExactArtifactPlans(previous, next, {
				changedInputs: ['/app/src/a.tsx']
			})
		).toEqual({
			added: [planEntry('/app/src/added.tsx')],
			removed: [planEntry('/app/src/removed.tsx')],
			changed: [planEntry('/app/src/a.tsx')],
			retained: []
		});
	});

	it('compiles selected artifact plan entries for incremental builds', async () => {
		const root = await createTestWorkspace('exact-artifact-entry-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		const changedInput = path.join(src, 'changed.tsx');
		const retainedInput = path.join(src, 'retained.tsx');
		await mkdir(src, { recursive: true });
		await writeFile(changedInput, 'export function Changed() { return () => <p>Changed</p>; }');
		await writeFile(retainedInput, 'export function Retained() { return () => <p>Retained</p>; }');

		const previous = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});
		const next = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});
		const diff = diffExactArtifactPlans(previous, next, {
			changedInputs: [changedInput]
		});
		const results = await compileArtifactPlanEntries(diff.changed);

		expect(results).toHaveLength(1);
		expect(results[0]!.inputFile).toBe(changedInput);
		expect(await readFile(results[0]!.clientFile, 'utf8')).toContain('changed.exact.shared.ts');
		expect(await readFile(results[0]!.sharedFile!, 'utf8')).toContain('Changed');
		await expect(readFile(path.join(outDir, 'retained.exact.client.ts'), 'utf8')).rejects.toThrow();
	});

	it('carries inferred reevaluation safety across local module boundaries', async () => {
		const root = await createTestWorkspace('exact-artifact-derived-import-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		await mkdir(src, { recursive: true });
		await writeFile(
			path.join(src, 'format.ts'),
			`export function format(value: string) { return value.trim().toUpperCase(); }`
		);
		await writeFile(
			path.join(src, 'Panel.tsx'),
			`
				import { format } from "./format.js";
				export function Panel(this: Component<{ name: string }>) {
					const label = format(this.state.name);
					return () => <p>{label}</p>;
				}
			`
		);

		const results = await compileProjectArtifacts([src], { outDir, rootDir: src });
		const panel = results.find((result) => result.inputFile.endsWith('Panel.tsx'))!;

		expect(await readFile(panel.clientFile, 'utf8')).toContain('format(this.state.name)');
	});

	it('does not trust imported helpers that mutate captured storage', async () => {
		const root = await createTestWorkspace('exact-artifact-effectful-derived-import-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		await mkdir(src, { recursive: true });
		await writeFile(
			path.join(src, 'format.ts'),
			`
				let calls = 0;
				export function format(value: string) {
					calls++;
					return value;
				}
			`
		);
		await writeFile(
			path.join(src, 'Panel.tsx'),
			`
				import { format } from "./format.js";
				export function Panel(this: Component<{ name: string }>) {
					const label = format(this.state.name);
					return () => <p>{label}</p>;
				}
			`
		);

		await expect(compileProjectArtifacts([src], { outDir, rootDir: src })).rejects.toThrow(
			/derived local label cannot be safely reevaluated/
		);
	});

	it('updates dev-server artifact state with retained analysis context', async () => {
		const root = await createTestWorkspace('exact-artifact-dev-state-');
		const src = path.join(root, 'src');
		const outDir = path.join(root, '.exact');
		const widgetInput = path.join(src, 'ClientWidget.tsx');
		const pageInput = path.join(src, 'Page.tsx');
		await mkdir(src, { recursive: true });
		await writeFile(
			widgetInput,
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `
		);
		await writeFile(
			pageInput,
			`
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <ClientWidget />;
      }
    `
		);

		const state = await createExactArtifactDevState([src], {
			outDir,
			rootDir: src,
			packageRoot: root,
			sourceRoot: src
		});
		await writeFile(
			pageInput,
			`
      import { ClientWidget } from "./ClientWidget";

      export function Page() {
        return () => <main><ClientWidget /></main>;
      }
    `
		);

		const updated = await updateExactArtifactDevState(state, [src], [pageInput], {
			outDir,
			rootDir: src,
			packageRoot: root,
			sourceRoot: src
		});
		const pageServer = await readFile(updated.compiled[0]!.serverFile, 'utf8');

		expect(updated.diff.changed).toEqual([expect.objectContaining({ inputFile: pageInput })]);
		expect(updated.compiled.map((result) => result.inputFile)).toEqual([pageInput]);
		expect(updated.entries.map((entry) => entry.inputFile).sort()).toEqual(
			[pageInput, widgetInput].sort()
		);
		expect(updated.graph.artifacts.map((entry) => entry.inputFile).sort()).toEqual(
			[pageInput, widgetInput].sort()
		);
		expect(pageServer).toContain('__exactBoundary');
		expect(pageServer).toContain('"ClientWidget"');
		expect(pageServer).not.toContain('from "./ClientWidget"');
		await expect(
			updateExactArtifactDevState(updated, [src], [], {
				outDir,
				rootDir: src,
				packageRoot: root,
				sourceRoot: src,
				buildKey: 'different-deployment'
			})
		).rejects.toThrow(/cannot change its coordinated partition build key/);
	});
});

function planEntry(inputFile: string) {
	const base = inputFile.replace(/\.tsx$/, '');
	return {
		inputFile,
		clientFile: `${base}.exact.client.ts`,
		serverFile: `${base}.exact.server.ts`,
		sharedFile: `${base}.exact.shared.ts`
	};
}
