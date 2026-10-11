/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { expect, it, onTestFinished, vi } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToHydratableString } from '@exactjs/ssr';
import { createExactClient, readExactHydrationConfig } from '@exactjs/hydrate';
import type { ClientIslandRegistry, ClientIslandLoader } from '@exactjs/hydrate';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import {
	partitionIslandSource,
	partitionIslandInstances
} from '../../../../framework-adapters/test-support/partition-island-contracts.js';
import {
	capturePartitionIslands,
	verifyPartitionIslands,
	verifyPartitionIslandsDisposed
} from '../../../../framework-adapters/test-support/verify-partition-islands.mjs';

it('preserves activation, event ownership and distinct snapshot paths through emitted islands', async () => {
	const root = await createTestWorkspace('.exact-partition-contracts-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	const outDir = path.join(root, 'generated');
	await writeFile(
		path.join(root, 'target-attribute-ownership.tsx'),
		await readFile(
			path.resolve(
				'packages/component-composition-corpus/src/test-support/target-attribute-ownership.fixtures.tsx'
			)
		)
	);
	await writeFile(
		entry,
		`import {type Component} from '@exactjs/core';${partitionIslandSource}
/** @exact server */
export function Page(){return()=> <main>${partitionIslandInstances}</main>;}`
	);
	const artifacts = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir,
		serverComponents: true
	});
	const graph = createExactArtifactGraph(artifacts, {
		packageRoot: root,
		sourceRoot: root,
		rootDir: outDir
	});
	const registryFile = path.join(outDir, 'registration.ts');
	await writeFile(registryFile, createExactHydrationRegistrationModule(graph));
	const server = await importArtifact(
		artifacts.find((artifact) => artifact.inputFile === entry)!.serverFile,
		path.join(root, 'server.mjs')
	);
	const registration = (await importArtifact(registryFile, path.join(root, 'registration.mjs')))
		.exactHydrationRegistration as { islands: ClientIslandRegistry };
	const loaders = Object.fromEntries(
		Object.entries(registration.islands).map(([name, entry]) => {
			const loader = entry as ClientIslandLoader;
			return [name, { ...loader, load: vi.fn(loader.load) }];
		})
	);
	for (const [component, mode] of [
		['ReplayOwnership', 'eager'],
		['DormantAwait', 'interaction'],
		['CapturedMethod', 'eager'],
		['DistinctPaths', 'interaction'],
		['OpaqueCallbacks', 'eager']
	]) {
		const name = Object.keys(loaders).find((name) => name.startsWith(component + '_ExactClient_'))!;
		expect(loaders[name]?.activation?.mode, component).toBe(mode);
	}
	const output = await renderToHydratableString(receipt(server.Page as AnyComponentFunction, {}));
	const container = document.createElement('div');
	container.innerHTML = output.htmlWithHydration;
	const targets = capturePartitionIslands(container);
	const errors: unknown[] = [];
	const view = createExactClient(container, {
		...readExactHydrationConfig(container),
		...registration,
		islands: loaders,
		onErrorReport: (report) => errors.push(report.error)
	});
	onTestFinished(() => view.dispose());
	await view.whenSettled();
	const dormant = Object.keys(loaders).find((name) =>
		name.startsWith('DormantAwait_ExactClient_')
	)!;
	expect(loaders[dormant]!.load).not.toHaveBeenCalled();
	await verifyPartitionIslands(container, targets);
	expect(loaders[dormant]!.load).toHaveBeenCalledOnce();
	expect(errors).toEqual([]);
	view.dispose();
	await verifyPartitionIslandsDisposed(targets);
	expect(errors).toEqual([]);
});
