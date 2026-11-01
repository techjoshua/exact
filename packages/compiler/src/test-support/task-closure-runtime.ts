import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactNodeHandler } from '@exactjs/node-adapter';
import { stateForContract } from '../../../hydrate/src/state.js';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from './import-artifact.js';
import { createTestWorkspace, writeTestFiles, repositoryPath } from './workspace.js';
import { createCompilerSession } from '../expression/session.js';

/** Compiles the shared task source and owns its HTTP listener and held gates until test cleanup. */
export async function taskClosureRuntime(name: string) {
	const root = await createTestWorkspace('.exact-task-closure-', process.cwd());
	const source = await readFile(
		repositoryPath(
			'packages/component-composition-corpus/test-support/task-closures',
			`${name}.tsx`
		),
		'utf8'
	);
	const files = await writeTestFiles(root, {
		'page.tsx': source,
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				lib: ['ESNext', 'DOM'],
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				strict: true,
				jsx: 'preserve',
				skipLibCheck: true
			},
			files: ['page.tsx']
		})
	});
	const session = createCompilerSession();
	onTestFinished(() => session.dispose());
	const native = session.compileNative({
		kind: 'analyze',
		id: files['page.tsx']!,
		root,
		source,
		configFile: files['tsconfig.json']
	});
	if (native.error) throw new Error(native.error);
	// Supported-source HTTP evidence requires both artifacts to pass semantic checking first.
	for (const target of ['client', 'server'] as const) {
		const checked = session.compileNative({
			kind: 'compile',
			id: files['page.tsx']!,
			root,
			source,
			configFile: files['tsconfig.json'],
			target,
			diagnostics: 'semantic'
		});
		// Cost warnings are advisory. Every semantic error and other warning still
		// participates in the fixture's explicit diagnostic contract below.
		const diagnostics = checked.diagnostics.filter(
			(diagnostic) => diagnostic.severity !== 'warning' || diagnostic.code !== 'EXACT_ANALYSIS_COST'
		);
		const expectedAdvisory =
			name === 'child'
				? diagnostics.filter(
						(diagnostic) =>
							diagnostic.code === 'EXACT2004' &&
							diagnostic.severity === 'warning' &&
							diagnostic.start === source.indexOf('async function child(')
					)
				: [];
		if (name === 'child' && expectedAdvisory.length !== 1)
			throw new Error(`${name}/${target}: missing detached server advisory`);
		if (checked.error || diagnostics.length !== expectedAdvisory.length)
			throw new Error(`${name}/${target}: ${checked.error ?? JSON.stringify(checked.diagnostics)}`);
		if (
			!checked.analysis.tasks.length ||
			checked.analysis.tasks.some((task) => task.placement !== 'server')
		)
			throw new Error(`${name}/${target}: explicit server task placement missing`);
	}
	const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		session
	});
	const artifact = artifacts.find((value) => value.inputFile === files['page.tsx'])!;
	const module = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
	const contract = composeExactExecutorContract([module.Page as AnyComponentFunction]);
	const operations = Object.values(contract.invocations);
	const reports: unknown[] = [];
	const server = createServer(
		createExactNodeHandler({
			contract,
			invocations: {},
			logger: { isEnabled: () => true, log: (report) => reports.push(report) }
		})
	);
	onTestFinished(async () => {
		for (const release of (module.gates as Map<string, () => void> | undefined)?.values() ?? [])
			release();
		server.closeAllConnections();
		if (server.listening)
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Missing task fixture listener');
	const origin = `http://127.0.0.1:${address.port}`;
	let generation = 0;
	return {
		module,
		tasks: native.analysis.tasks,
		operations,
		reports,
		/** Sends the complete declared activation input through the ordinary server handler. */
		async invoke(
			state: Record<string, unknown>,
			operation = operations[0]!,
			argument?: number,
			signal?: AbortSignal
		) {
			const dependencies = operation.dependencies.map((dependency) => {
				if (dependency.source === 'argument') return argument;
				if (dependency.source === 'derived') return Number(dependency.path);
				return dependency.path
					?.replace(/^this\.state\./, '')
					.split('.')
					.reduce<unknown>(
						(value, key) => (value as Record<string, unknown> | undefined)?.[key],
						state
					);
			});
			const response = await fetch(origin + '/__exact', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: JSON.stringify(
					encodeReactiveProtocolValue({
						type: 'invoke',
						id: operation.id,
						...(operation.stateWrites.some((write) => write.arrayRoots?.length)
							? { arrayCompletion: 4 as const }
							: {}),
						state: stateForContract(state, { reads: operation.stateReads }),
						payload: { dependencies, generation: ++generation }
					})
				),
				signal: signal
					? AbortSignal.any([signal, AbortSignal.timeout(10000)])
					: AbortSignal.timeout(10000)
			});
			if (response.status !== 200)
				throw new Error(`Task fixture HTTP ${response.status}: ${await response.text()}`);
			return decodeReactiveProtocolValue(await response.json()) as Record<string, unknown>;
		}
	};
}
