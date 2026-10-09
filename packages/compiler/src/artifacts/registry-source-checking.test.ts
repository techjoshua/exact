import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { createExactArtifactGraph } from '../artifacts.js';
import { createExactHydrationRegistrationModule } from '../registry.js';
import { createTestWorkspace } from '../test-support/workspace.js';

it('allows generated hydration loaders to select private runtime exports absent from public declarations', async () => {
	const root = await createTestWorkspace('exact-private-loader-', path.resolve('.tmp'));
	const file = path.join(root, 'registration.ts');
	await mkdir(path.join(root, 'node_modules/@fixture/kit'), { recursive: true });
	await writeFile(
		path.join(root, 'node_modules/@fixture/kit/package.json'),
		JSON.stringify({ name: '@fixture/kit', types: 'index.d.ts' })
	);
	await writeFile(
		path.join(root, 'node_modules/@fixture/kit/index.d.ts'),
		'export declare function PublicView(): unknown;'
	);
	const graph = createExactArtifactGraph([], { packageRoot: root });
	graph.clientIslands.push({
		id: 'private-owner',
		name: 'View_ExactClient_1',
		exportName: 'View_ExactClient_1',
		module: '@fixture/kit'
	});
	await writeFile(file, createExactHydrationRegistrationModule(graph));
	const program = ts.createProgram([file], {
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler
	});
	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => diagnostic.file?.fileName === file);
	expect(
		diagnostics.map((diagnostic) => ({
			code: diagnostic.code,
			message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		}))
	).toEqual([]);
});
