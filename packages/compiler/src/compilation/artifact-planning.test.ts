import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	analyzeSource,
	compileArtifactPlanEntries,
	compileProjectArtifacts,
	createExactArtifactDevState,
	createExactArtifactPlan,
	diffExactArtifactPlans,
	exactCompilerManifestVersion,
	parseExactCompilerManifest,
	readExactArtifactManifestEntries,
	updateExactArtifactDevState
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';

describe('@exact/compiler: artifact planning', () => {
	it('rejects unsupported generated artifact manifest versions', async () => {
		const root = await createTestWorkspace('exact-artifact-manifest-version-');
		const manifestFile = path.join(root, 'panel.exact.manifest.json');
		await writeFile(
			manifestFile,
			JSON.stringify({
				version: exactCompilerManifestVersion + 1,
				artifacts: {
					source: 'panel.tsx',
					client: 'panel.exact.client.ts',
					server: 'panel.exact.server.ts',
					manifest: 'panel.exact.manifest.json',
					exports: [],
					symbols: [],
					boundaries: []
				}
			})
		);

		await expect(readExactArtifactManifestEntries([manifestFile])).rejects.toThrow(
			'Unsupported eXact artifact manifest version'
		);
	});

	it('rejects malformed compiler manifests before use', () => {
		expect(() =>
			parseExactCompilerManifest(
				{
					version: exactCompilerManifestVersion,
					filename: 'Panel.tsx',
					components: []
				},
				'Panel.exact.manifest.json'
			)
		).toThrow('Malformed eXact compiler manifest');
	});

	it('rejects unsupported versions and malformed v1 callable graphs', () => {
		const manifest = analyzeSource(`export function value() { return 1; }`, {
			filename: 'value.ts'
		});
		expect(() =>
			parseExactCompilerManifest({ ...manifest, version: -1 } as never, 'unsupported.json')
		).toThrow('Unsupported eXact compiler manifest version in unsupported.json: -1');
		expect(() =>
			parseExactCompilerManifest(
				{ ...manifest, dependencies: ['C:\\private\\value.ts'] },
				'absolute.json'
			)
		).toThrow('Malformed eXact compiler dependencies');
		expect(() =>
			parseExactCompilerManifest(
				{
					...manifest,
					callables: manifest.callables.map((callable, index) =>
						index
							? callable
							: {
									...callable,
									calls: [{ id: 'dangling', name: 'missing', targetId: 'missing', resolved: true }]
								}
					)
				},
				'dangling.json'
			)
		).toThrow('Malformed eXact compiler callable graph');
		expect(() =>
			parseExactCompilerManifest(
				{
					...manifest,
					callables: manifest.callables.map((callable, index) =>
						index
							? callable
							: {
									...callable,
									stateWrites: [
										{
											path: 'x',
											kind: 'write',
											confidence: 'exact',
											receiver: { kind: 'parameter' }
										}
									]
								}
					)
				} as never,
				'nested.json'
			)
		).toThrow('Malformed eXact compiler callable summaries');
	});

	it('projects binder identities onto the declared portable manifest filename', () => {
		const manifest = analyzeSource('export function View() { return () => <p />; }', {
			filename: 'src/View.tsx'
		});
		const serialized = JSON.stringify(manifest.semanticGraph);
		expect(serialized).toContain('src/view.tsx:');
		expect(serialized).not.toMatch(/[a-z]:\/(?:users|home)\//i);
	});

	it('validates semantic graph metadata in parsed compiler manifests', () => {
		const manifest = analyzeSource(
			`
      export function Panel() {
        return () => <p>Ready</p>;
      }
    `,
			{ filename: 'Panel.tsx' }
		);

		expect(
			parseExactCompilerManifest(manifest, 'Panel.exact.manifest.json').semanticGraph?.exports
		).toHaveLength(1);
		expect(() =>
			parseExactCompilerManifest(
				{
					...manifest,
					semanticGraph: {
						...manifest.semanticGraph,
						references: [{ name: 'Panel' }]
					}
				},
				'Panel.exact.manifest.json'
			)
		).toThrow('Malformed eXact compiler semantic graph');
	});

	it('rejects malformed generated artifact metadata', async () => {
		const root = await createTestWorkspace('exact-artifact-manifest-malformed-');
		const manifestFile = path.join(root, 'panel.exact.manifest.json');
		await writeFile(
			manifestFile,
			JSON.stringify({
				version: exactCompilerManifestVersion,
				filename: 'panel.tsx',
				dependencies: [],
				assets: [],
				components: [],
				exports: [],
				symbols: [],
				boundaries: [],
				callables: [],
				policy: { version: 1, subjects: [], flows: [], secretConsumers: [] },
				artifacts: {
					source: 1,
					client: 'panel.exact.client.ts',
					server: 'panel.exact.server.ts',
					manifest: 'panel.exact.manifest.json',
					exports: [],
					symbols: [],
					boundaries: []
				},
				serverActions: {},
				diagnostics: []
			})
		);

		await expect(readExactArtifactManifestEntries([manifestFile])).rejects.toThrow(
			'malformed artifact metadata'
		);
	});

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
					sharedFile: path.join(outDir, 'components', 'panel.exact.shared.ts'),
					manifestFile: path.join(outDir, 'components', 'panel.exact.manifest.json')
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

	it('uses retained manifests when compiling selected artifact plan entries', async () => {
		const root = await createTestWorkspace('exact-artifact-retained-manifests-');
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

		const initial = await compileProjectArtifacts([src], {
			outDir,
			rootDir: src
		});
		const retained = await readExactArtifactManifestEntries(
			initial
				.filter((result) => result.inputFile === widgetInput)
				.map((result) => result.manifestFile)
		);
		const plan = await createExactArtifactPlan([src], {
			outDir,
			rootDir: src
		});
		const changedPage = plan.entries.filter((entry) => entry.inputFile === pageInput);
		const updated = await compileArtifactPlanEntries(changedPage, {
			importedManifests: retained.map((entry) => entry.manifest)
		});
		const server = await readFile(updated[0]!.serverFile, 'utf8');

		expect(server).toContain('__exactBoundary');
		expect(server).toContain('"ClientWidget"');
		expect(server).not.toContain('from "./ClientWidget"');
	});

	it('updates dev-server artifact state with retained manifest context', async () => {
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
	});
});

function planEntry(inputFile: string) {
	const base = inputFile.replace(/\.tsx$/, '');
	return {
		inputFile,
		clientFile: `${base}.exact.client.ts`,
		serverFile: `${base}.exact.server.ts`,
		sharedFile: `${base}.exact.shared.ts`,
		manifestFile: `${base}.exact.manifest.json`
	};
}
