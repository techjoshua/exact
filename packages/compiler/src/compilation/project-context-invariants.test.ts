/** @vitest-environment jsdom */
import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it, onTestFinished } from 'vitest';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerSession } from '../expression/session.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import {
	projectContextCases,
	observeProjectContextCase
} from '../test-support/project-context-observations.js';
import { artifactAnalysis } from './analysis-results.js';

const corpus = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../component-composition-corpus/src/scenarios'
);

// Project context is not authored behavior. These transformations deliberately vary the context
// around existing corpus programs while retaining independent render/update/identity oracles.
it.each(projectContextCases)(
	'preserves $fixture under project-context perturbations',
	async (test) => {
		const root = await createTestWorkspace('.exact-context-invariants-', process.cwd());
		const src = path.join(root, 'src');
		await cp(corpus, src, { recursive: true });
		const entry = path.join(src, `${test.fixture}.fixtures.tsx`);
		const original = await readFile(entry, 'utf8');
		const tree = ts.createSourceFile(
			entry,
			original,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX
		);
		const positions = tree.statements
			.filter(
				(statement) =>
					ts.canHaveModifiers(statement) &&
					ts
						.getModifiers(statement)
						?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
			)
			.slice(0, 3)
			.map((statement) => Buffer.byteLength(original.slice(0, statement.pos)));
		expect(positions.length).toBeGreaterThan(0);
		const sidecars = positions.map((_, index) => path.join(src, `context-${index}.ts`));
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'preserve',
					types: ['node'],
					skipLibCheck: true
				},
				files: [entry, ...sidecars]
			})
		);
		const warm = createCompilerSession();
		onTestFinished(() => warm.dispose());
		let baseline: unknown;
		const variants = [
			'baseline',
			'server-context',
			'client-context',
			'reverse-order',
			'without-context',
			'shifted-source',
			'named-parameter',
			'restored'
		] as const;
		for (const [round, variant] of variants.entries()) {
			let source = original;
			if (variant === 'shifted-source')
				source = `/* Project context invariant: UTF-8 π */\n\n${source}`;
			if (variant === 'named-parameter') {
				let selected: ts.TypeLiteralNode | undefined;
				const visit = (node: ts.Node): void => {
					if (!selected && ts.isParameter(node) && node.type && ts.isTypeLiteralNode(node.type))
						selected = node.type;
					if (!selected) ts.forEachChild(node, visit);
				};
				visit(tree);
				if (selected) {
					source =
						original.slice(0, selected.getStart(tree)) +
						'ProjectContextProps' +
						original.slice(selected.end) +
						`\ntype ProjectContextProps = ${selected.getText(tree)};\n`;
				}
			}
			await writeFile(entry, source);
			for (const [index, sidecar] of sidecars.entries()) {
				const effect =
					variant === 'server-context' ||
					variant === 'reverse-order' ||
					variant === 'named-parameter'
						? 'process.env.EXACT_CONTEXT = "isolated";'
						: variant === 'client-context' || variant === 'shifted-source'
							? 'window.name = "isolated";'
							: '';
				await writeFile(sidecar, ';'.repeat(positions[index]!) + effect + '\nexport {};');
			}
			if (round) {
				warm.invalidate(entry);
				for (const sidecar of sidecars) warm.invalidate(sidecar);
			}
			const entries =
				variant === 'without-context'
					? [entry]
					: variant === 'reverse-order'
						? [...sidecars].reverse().concat(entry)
						: [entry, ...sidecars];
			const configFile = path.join(root, 'tsconfig.json');
			const previousConfig = await readFile(configFile, 'utf8');
			const config = JSON.parse(previousConfig);
			config.files = entries;
			const nextConfig = JSON.stringify(config);
			if (previousConfig !== nextConfig) {
				await writeFile(configFile, nextConfig);
				warm.invalidate(configFile);
			}
			const cold = createCompilerSession();
			try {
				for (const [temperature, session] of [
					['warm', warm],
					['cold', cold]
				] as const) {
					const outDir = path.join(root, `out-${round}-${temperature}`);
					const results = await compileProjectArtifacts(entries, {
						rootDir: src,
						outDir,
						session
					});
					const artifact = results.find((result) => result.inputFile === entry)!;
					const client = await importArtifact(
						artifact.clientFile,
						path.join(root, `client-${round}-${temperature}.mjs`)
					);
					const server = await importArtifact(
						artifact.serverFile,
						path.join(root, `server-${round}-${temperature}.mjs`)
					);
					const observation = {
						exports: { client: Object.keys(client).sort(), server: Object.keys(server).sort() },
						placement: artifactAnalysis(artifact)
							.components.map((component) => ({
								name: component.name,
								placement: component.placement,
								targets: component.artifactTargets
							}))
							.sort((a, b) => a.name.localeCompare(b.name)),
						behavior: await observeProjectContextCase(test, client, server)
					};
					if (!round && temperature === 'warm') baseline = observation;
					expect(observation, `${test.fixture}: ${variant}, ${temperature}`).toEqual(baseline);
				}
			} finally {
				cold.dispose();
			}
		}
	},
	60000
);
