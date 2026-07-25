import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	createExactDiagnosticReporter,
	exactDiagnosticKey,
	formatExactDiagnostic,
	loadExactImportedManifests,
	matchesExactBuildFilter
} from './adapter-support.js';
import { createTestWorkspace, writeTestFiles } from './test-support/workspace.js';
import type { ExactCompilerManifest } from './types.js';

describe('build adapter support', () => {
	it('matches string, regular expression, and mixed path filters', () => {
		expect(matchesExactBuildFilter('/src/view.tsx', '/src/')).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', /\.tsx$/)).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', [/node_modules/, 'view.tsx'])).toBe(true);
		expect(matchesExactBuildFilter('/src/view.ts', [/node_modules/, /\.tsx$/])).toBe(false);
	});

	it('resets stateful regular expressions between filter checks', () => {
		const filter = /view/g;
		expect(matchesExactBuildFilter('/src/view.tsx', filter)).toBe(true);
		expect(matchesExactBuildFilter('/src/view.tsx', filter)).toBe(true);
	});

	it('formats and keys diagnostics consistently', () => {
		const diagnostic = {
			code: 'TS2322',
			message: 'Type string is not assignable to number',
			filename: '/src/model.ts',
			span: { line: 4, column: 7 }
		};
		expect(exactDiagnosticKey(diagnostic)).toBe(
			'TS2322:4:7:Type string is not assignable to number'
		);
		expect(formatExactDiagnostic(diagnostic)).toBe(
			'/src/model.ts:4:7 - TS2322: Type string is not assignable to number'
		);
	});

	it('reports only newly introduced diagnostics and releases invalidated files', () => {
		const report = createExactDiagnosticReporter();
		const warnings: string[] = [];
		const diagnostic = {
			code: 'TS2322',
			message: 'Type string is not assignable to number',
			filename: '/src/model.ts'
		};

		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		expect(warnings).toHaveLength(1);

		report({ affectedFiles: ['/src/model.ts'], diagnostics: [] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: ['/src/model.ts'], diagnostics: [diagnostic] }, (warning) =>
			warnings.push(warning)
		);
		expect(warnings).toHaveLength(2);
	});

	it('normalizes invalidated Windows paths before releasing diagnostics', () => {
		const report = createExactDiagnosticReporter();
		const warnings: string[] = [];
		const diagnostic = { code: 'EXACT1', message: 'changed', filename: 'C:/src/model.ts' };

		report({ affectedFiles: [], diagnostics: [diagnostic] }, (warning) => warnings.push(warning));
		report({ affectedFiles: ['C:\\src\\model.ts'], diagnostics: [] }, (warning) =>
			warnings.push(warning)
		);
		report({ affectedFiles: [], diagnostics: [diagnostic] }, (warning) => warnings.push(warning));
		expect(warnings).toHaveLength(2);
	});

	it('combines in-memory manifests with freshly read file manifests', async () => {
		const root = await createTestWorkspace('exact-adapter-support-');
		const manifestFile = path.join(root, 'widget.exact.manifest.json');
		const inMemory = emptyManifest('/src/app.tsx');
		await writeTestFiles(root, {
			'widget.exact.manifest.json': JSON.stringify(emptyManifest('/src/widget.tsx'))
		});

		expect(
			loadExactImportedManifests({
				importedManifests: [inMemory],
				manifestFiles: [manifestFile]
			}).map((manifest) => manifest.filename)
		).toEqual(['/src/app.tsx', '/src/widget.tsx']);

		await writeTestFiles(root, {
			'widget.exact.manifest.json': JSON.stringify(emptyManifest('/src/updated-widget.tsx'))
		});
		expect(loadExactImportedManifests({ manifestFiles: [manifestFile] })[0]?.filename).toBe(
			'/src/updated-widget.tsx'
		);
	});

	it('rejects malformed file-backed manifests at the shared adapter boundary', async () => {
		const root = await createTestWorkspace('exact-adapter-support-invalid-');
		const manifestFile = path.join(root, 'invalid.exact.manifest.json');
		await writeTestFiles(root, {
			'invalid.exact.manifest.json': JSON.stringify({ version: 99, components: [] })
		});
		expect(() => loadExactImportedManifests({ manifestFiles: [manifestFile] })).toThrow(/version/i);
	});
});

function emptyManifest(filename: string): ExactCompilerManifest {
	return {
		version: 1,
		filename,
		dependencies: [],
		assets: [],
		components: [],
		exports: [],
		symbols: [],
		boundaries: [],
		callables: [],
		continuations: [],
		resumptions: [],
		policy: { version: 1, subjects: [], flows: [], secretConsumers: [] },
		serverActions: {},
		diagnostics: []
	};
}
